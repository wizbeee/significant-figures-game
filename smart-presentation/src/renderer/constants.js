// 슬라이드 기본 설정
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;
export const SLIDE_RATIO = SLIDE_WIDTH / SLIDE_HEIGHT;

// 기본 폰트
export const DEFAULT_FONT = 'Malgun Gothic';
export const DEFAULT_FONT_SIZE = 24;
export const HEADING_FONT_SIZE = 48;
export const SUBHEADING_FONT_SIZE = 32;

// 색상 팔레트
export const COLORS = {
  primary: '#4361ee',
  secondary: '#3f37c9',
  accent: '#f72585',
  success: '#06d6a0',
  warning: '#ffd166',
  danger: '#ef476f',
  dark: '#1a1a2e',
  darker: '#16213e',
  darkest: '#0f0f23',
  light: '#e0e0e0',
  lighter: '#f0f0f0',
  white: '#ffffff',
  black: '#000000',
  gray: '#6c757d',
  grayLight: '#adb5bd',
  grayDark: '#495057'
};

// 도형 기본 스타일
export const DEFAULT_SHAPE_STYLES = {
  fill: COLORS.primary,
  stroke: '',
  strokeWidth: 0,
  opacity: 1,
  rx: 0,
  ry: 0
};

// 텍스트 기본 스타일
export const DEFAULT_TEXT_STYLES = {
  fill: COLORS.white,
  fontFamily: DEFAULT_FONT,
  fontSize: DEFAULT_FONT_SIZE,
  fontWeight: 'normal',
  fontStyle: '',
  textAlign: 'left',
  lineHeight: 1.3
};

// 전환 효과
export const TRANSITIONS = [
  { id: 'none', name: '없음', icon: '⊘' },
  { id: 'fade', name: '페이드', icon: '◐' },
  { id: 'slide-left', name: '슬라이드 ←', icon: '←' },
  { id: 'slide-right', name: '슬라이드 →', icon: '→' },
  { id: 'slide-up', name: '슬라이드 ↑', icon: '↑' },
  { id: 'zoom-in', name: '확대', icon: '⊕' },
  { id: 'zoom-out', name: '축소', icon: '⊖' }
];

// 템플릿 레이아웃
export const LAYOUTS = {
  blank: { name: '빈 슬라이드', icon: '☐' },
  titleOnly: { name: '제목만', icon: '▬' },
  titleBody: { name: '제목 + 본문', icon: '⊞' },
  twoColumn: { name: '2단 구성', icon: '⊟' },
  imageText: { name: '이미지 + 텍스트', icon: '⊠' },
  titleCenter: { name: '중앙 제목', icon: '◉' }
};

// 테마 프리셋
export const THEME_PRESETS = [
  { id: 'dark', name: '다크', bg: '#1a1a2e', text: '#ffffff', accent: '#4361ee' },
  { id: 'light', name: '라이트', bg: '#ffffff', text: '#1a1a2e', accent: '#4361ee' },
  { id: 'ocean', name: '오션', bg: '#0a1628', text: '#e0f0ff', accent: '#00b4d8' },
  { id: 'forest', name: '포레스트', bg: '#1b2d1b', text: '#e0ffe0', accent: '#06d6a0' },
  { id: 'sunset', name: '선셋', bg: '#2d1b2d', text: '#ffe0f0', accent: '#f72585' },
  { id: 'minimal', name: '미니멀', bg: '#f5f5f5', text: '#333333', accent: '#555555' },
  { id: 'education', name: '교육용', bg: '#1a237e', text: '#ffffff', accent: '#ffd54f' }
];

// 그리드 설정
export const GRID = {
  size: 20,
  color: 'rgba(255,255,255,0.05)',
  snapThreshold: 10
};
