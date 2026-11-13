export class MoodleError extends Error {
  constructor(
    message: string,
    public readonly errorcode?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'MoodleError';
  }
}

export interface MoodleSiteInfo {
  userid: number;
  username: string;
  fullname: string;
  sitename: string;
}

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  progress?: number | null;
  timemodified?: number;
}

export interface MoodleAssignment {
  id: number;
  cmid: number;
  course: number;
  name: string;
  duedate: number;
  cutoffdate: number;
  timemodified: number;
  intro?: string;
}

export interface MoodleAssignmentsResponse {
  courses: Array<{
    id: number;
    shortname: string;
    fullname: string;
    assignments: MoodleAssignment[];
  }>;
  warnings?: Array<{ item: string; warningcode: string; message: string }>;
}

export interface MoodleGradeItem {
  id: number;
  itemname: string | null;
  itemtype: string;
  itemmodule: string | null;
  iteminstance: number | null;
  cmid?: number | null;
  graderaw?: number | null;
  gradeformatted?: string;
  grademin?: number;
  grademax?: number;
  gradedatesubmitted?: number | null;
  gradedategraded?: number | null;
  feedback?: string | null;
}

export interface MoodleGradeItemsResponse {
  usergrades: Array<{
    courseid: number;
    userid: number;
    gradeitems: MoodleGradeItem[];
  }>;
}

export interface MoodleForum {
  id: number;
  course: number;
  type: string;
  name: string;
  cmid: number;
  timemodified: number;
}

export interface MoodleForumDiscussion {
  id: number;
  discussion?: number;
  name: string;
  subject?: string;
  message?: string;
  timemodified: number;
  created?: number;
  userfullname?: string;
  pinned?: boolean;
}

export interface MoodleForumDiscussionsResponse {
  discussions: MoodleForumDiscussion[];
}

export interface MoodleSubmissionStatusResponse {
  lastattempt?: {
    submission?: {
      id: number;
      status: string;
      timemodified: number;
    };
    submissionsenabled?: boolean;
    locked?: boolean;
    graded?: boolean;
    extensionduedate?: number | null;
    teamid?: number;
  };
  feedback?: {
    grade?: {
      grade: string;
      timemodified: number;
    };
  };
}

function appendFormParams(
  searchParams: URLSearchParams,
  params: Record<string, string | number | Array<string | number>>
) {
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        searchParams.append(`${key}[${index}]`, String(item));
      });
    } else {
      searchParams.append(key, String(value));
    }
  }
}

export class MoodleClient {
  private subrequests = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly maxSubrequests = 45
  ) {}

  get subrequestsUsed(): number {
    return this.subrequests;
  }

  get remainingBudget(): number {
    return Math.max(0, this.maxSubrequests - this.subrequests);
  }

  get hasBudget(): boolean {
    return this.subrequests < this.maxSubrequests;
  }

  async call<T>(
    wsfunction: string,
    params: Record<string, string | number | Array<string | number>> = {}
  ): Promise<T> {
    if (!this.hasBudget) {
      throw new MoodleError('Subrequest budget reached', 'budget_exceeded');
    }

    const body = new URLSearchParams();
    body.append('wstoken', this.token);
    body.append('wsfunction', wsfunction);
    body.append('moodlewsrestformat', 'json');
    appendFormParams(body, params);

    const url = `${this.baseUrl.replace(/\/$/, '')}/webservice/rest/server.php`;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.subrequests++;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxAttempts && this.hasBudget) {
          const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 4000);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw new MoodleError(`HTTP ${res.status} from Moodle`, 'http_error', res.status);
      }

      if (!res.ok) {
        throw new MoodleError(`HTTP ${res.status} from Moodle`, 'http_error', res.status);
      }

      const data = (await res.json()) as T & {
        exception?: string;
        errorcode?: string;
        message?: string;
      };

      if (data && typeof data === 'object' && 'exception' in data && data.exception) {
        throw new MoodleError(
          `${wsfunction}: ${data.message || 'Moodle WebService exception'}`,
          data.errorcode
        );
      }

      return data;
    }

    throw new MoodleError('Max retry attempts exceeded', 'max_retries');
  }

  getSiteInfo(): Promise<MoodleSiteInfo> {
    return this.call<MoodleSiteInfo>('core_webservice_get_site_info');
  }

  getUserCourses(userid: number): Promise<MoodleCourse[]> {
    return this.call<MoodleCourse[]>('core_enrol_get_users_courses', { userid });
  }

  getAssignments(courseIds: number[]): Promise<MoodleAssignmentsResponse> {
    if (courseIds.length === 0) {
      return Promise.resolve({ courses: [] });
    }
    return this.call<MoodleAssignmentsResponse>('mod_assign_get_assignments', {
      courseids: courseIds,
    });
  }

  getSubmissionStatus(assignId: number): Promise<MoodleSubmissionStatusResponse> {
    return this.call<MoodleSubmissionStatusResponse>('mod_assign_get_submission_status', {
      assignid: assignId,
    });
  }

  getGradeItems(courseId: number, userId: number): Promise<MoodleGradeItemsResponse> {
    return this.call<MoodleGradeItemsResponse>('gradereport_user_get_grade_items', {
      courseid: courseId,
      userid: userId,
    });
  }

  getForumsByCourses(courseIds: number[]): Promise<MoodleForum[]> {
    if (courseIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.call<MoodleForum[]>('mod_forum_get_forums_by_courses', {
      courseids: courseIds,
    });
  }

  getForumDiscussions(forumId: number, perpage = 15): Promise<MoodleForumDiscussionsResponse> {
    return this.call<MoodleForumDiscussionsResponse>('mod_forum_get_forum_discussions', {
      forumid: forumId,
      page: 0,
      perpage,
    });
  }

  getCourseContents(courseId: number): Promise<unknown[]> {
    return this.call<unknown[]>('core_course_get_contents', {
      courseid: courseId,
    });
  }
}
