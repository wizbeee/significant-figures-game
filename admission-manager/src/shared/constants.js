// 전형 상태
const STATUS = {
  RECEIVED: 'received',       // 접수완료
  DOC_PASS: 'doc_pass',       // 서류통과
  DOC_FAIL: 'doc_fail',       // 서류탈락
  INTERVIEW_PASS: 'interview_pass', // 면접통과
  INTERVIEW_FAIL: 'interview_fail', // 면접탈락
  ACCEPTED: 'accepted',       // 최종합격
  REJECTED: 'rejected',       // 불합격
  WAITLIST: 'waitlist',       // 추가합격대기
  EXTRA_ACCEPTED: 'extra_accepted', // 추가합격
};

const STATUS_LABEL = {
  [STATUS.RECEIVED]: '접수완료',
  [STATUS.DOC_PASS]: '서류통과',
  [STATUS.DOC_FAIL]: '서류탈락',
  [STATUS.INTERVIEW_PASS]: '면접통과',
  [STATUS.INTERVIEW_FAIL]: '면접탈락',
  [STATUS.ACCEPTED]: '최종합격',
  [STATUS.REJECTED]: '불합격',
  [STATUS.WAITLIST]: '추가합격대기',
  [STATUS.EXTRA_ACCEPTED]: '추가합격',
};

const STATUS_COLOR = {
  [STATUS.RECEIVED]: 'bg-blue-100 text-blue-700',
  [STATUS.DOC_PASS]: 'bg-emerald-100 text-emerald-700',
  [STATUS.DOC_FAIL]: 'bg-red-100 text-red-700',
  [STATUS.INTERVIEW_PASS]: 'bg-teal-100 text-teal-700',
  [STATUS.INTERVIEW_FAIL]: 'bg-red-100 text-red-700',
  [STATUS.ACCEPTED]: 'bg-amber-100 text-amber-700',
  [STATUS.REJECTED]: 'bg-gray-200 text-gray-600',
  [STATUS.WAITLIST]: 'bg-purple-100 text-purple-700',
  [STATUS.EXTRA_ACCEPTED]: 'bg-amber-100 text-amber-700',
};

// 전형 유형
const ADMISSION_TYPES = ['일반전형', '사회통합전형', '지역우선선발'];

// 서류 평가 항목
const DOC_CATEGORIES = ['자기소개서', '학교생활기록부', '교사추천서'];

// 면접 평가 항목
const INTERVIEW_CATEGORIES = ['자기주도학습능력', '인성및사회성', '지원동기및진로계획'];

// 수험번호 생성
const generateExamNumber = (year, seq) => {
  return `${year}-${String(seq).padStart(4, '0')}`;
};

export {
  STATUS, STATUS_LABEL, STATUS_COLOR,
  ADMISSION_TYPES, DOC_CATEGORIES, INTERVIEW_CATEGORIES,
  generateExamNumber,
};
