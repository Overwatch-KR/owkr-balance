const getSurveySubmissionKey = (surveyId: string): string => (
    `survey:${surveyId}:submitted`
);

const getVoteSubmissionKey = (scrimId: string): string => (
    `vote:${scrimId}:submitted`
);

/**
 * @description 현재 브라우저에서 해당 설문을 이미 제출했는지 확인한다.
 */
export const hasSubmittedSurvey = (surveyId: string): boolean => {
    try {
        return localStorage.getItem(getSurveySubmissionKey(surveyId)) === 'true';
    } catch {
        return false;
    }
};

/**
 * @description 성공적으로 제출한 설문을 현재 브라우저에 기록한다.
 */
export const markSurveyAsSubmitted = (surveyId: string): boolean => {
    try {
        localStorage.setItem(getSurveySubmissionKey(surveyId), 'true');
        return true;
    } catch {
        return false;
    }
};

/**
 * @description 현재 브라우저에서 해당 영웅 밴 투표를 이미 제출했는지 확인한다.
 */
export const hasSubmittedVote = (scrimId: string): boolean => {
    try {
        return localStorage.getItem(getVoteSubmissionKey(scrimId)) === 'true';
    } catch {
        return false;
    }
};

/**
 * @description 성공적으로 제출한 영웅 밴 투표를 현재 브라우저에 기록한다.
 */
export const markVoteAsSubmitted = (scrimId: string): boolean => {
    try {
        localStorage.setItem(getVoteSubmissionKey(scrimId), 'true');
        return true;
    } catch {
        return false;
    }
};
