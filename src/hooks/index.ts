// Hooks barrel export
export { useDashboardStats } from './useDashboardStats';
export { useActivityLogs } from './useActivityLogs';
export { useExams } from './useExams';
export { useUserScope, useOrganizationName } from './useUserScope';

export type { DashboardStats, MonthlyExamCount } from './useDashboardStats';
export type { ActivityLog } from './useActivityLogs';
export type { Exam, ExamPaper, ExamProblem } from './useExams';
export type { UserScope } from './useUserScope';

