const { ipcRenderer } = window.require('electron');

const ipc = {
  // 인증
  isPasswordSet: () => ipcRenderer.invoke('auth:isPasswordSet'),
  setPassword: (pw) => ipcRenderer.invoke('auth:setPassword', pw),
  verify: (pw) => ipcRenderer.invoke('auth:verify', pw),
  changePassword: (oldPw, newPw) => ipcRenderer.invoke('auth:changePassword', oldPw, newPw),

  // 설정
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (data) => ipcRenderer.invoke('config:update', data),

  // 지원자
  listApplicants: (filters) => ipcRenderer.invoke('applicants:list', filters),
  getApplicant: (id) => ipcRenderer.invoke('applicants:get', id),
  createApplicant: (data) => ipcRenderer.invoke('applicants:create', data),
  updateApplicant: (id, data) => ipcRenderer.invoke('applicants:update', id, data),
  deleteApplicant: (id) => ipcRenderer.invoke('applicants:delete', id),
  bulkUpdateStatus: (ids, status) => ipcRenderer.invoke('applicants:bulkUpdateStatus', ids, status),
  importExcel: (filePath) => ipcRenderer.invoke('applicants:importExcel', filePath),
  openExcelDialog: () => ipcRenderer.invoke('dialog:openExcel'),

  // 점수
  saveDocScores: (applicantId, scores) => ipcRenderer.invoke('scores:saveDoc', applicantId, scores),
  saveInterviewScores: (applicantId, scores) => ipcRenderer.invoke('scores:saveInterview', applicantId, scores),

  // 선발
  calculateSelection: () => ipcRenderer.invoke('selection:calculate'),
  decideSelection: (decisions) => ipcRenderer.invoke('selection:decide', decisions),
  getResults: () => ipcRenderer.invoke('selection:getResults'),

  // 통계
  getDashboard: () => ipcRenderer.invoke('stats:dashboard'),

  // 내보내기
  exportExcel: (type) => ipcRenderer.invoke('export:excel', type),

  // 백업
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),

  // 자동완성
  getSchools: () => ipcRenderer.invoke('autocomplete:schools'),
};

export default ipc;
