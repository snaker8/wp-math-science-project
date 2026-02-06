
export interface SparklineData {
    value: number;
}

export interface StatCardData {
    title: string;
    value: string;
    trend: string;
    trendUp: boolean;
    data: SparklineData[];
}

export interface HeatmapCell {
    student: string;
    unit: string;
    score: number; // 0-100
}

export interface ActivityLog {
    id: string;
    title: string;
    description: string;
    time: string;
    type: 'grading' | 'clinic' | 'system';
}

export interface ClassStatus {
    id: string;
    name: string;
    time: string;
    students: number;
    status: 'active' | 'scheduled' | 'finished';
}

// 1. Stats Data with Sparkline points
export const statsData: StatCardData[] = [
    {
        title: '총 수강생',
        value: '1,248',
        trend: '+12%',
        trendUp: true,
        data: Array.from({ length: 20 }, () => ({ value: 40 + Math.random() * 60 })),
    },
    {
        title: '활성 학습지',
        value: '856',
        trend: '+5.4%',
        trendUp: true,
        data: Array.from({ length: 20 }, () => ({ value: 30 + Math.random() * 70 })),
    },
    {
        title: '평균 성취도',
        value: '78.4점',
        trend: '-2.1%',
        trendUp: false,
        data: Array.from({ length: 20 }, () => ({ value: 60 + Math.random() * 40 })),
    },
];

// 2. Heatmap Data (10 students x 10 units)
export const heatmapData: HeatmapCell[] = [];
const students = ['김민수', '이서준', '박지윤', '최서연', '정현우', '강하은', '조민재', '윤서아', '임도현', '한예린'];
const units = ['다항식', '방정식', '부등식', '함수', '삼각함수', '수열', '지수로그', '극한', '미분', '적분'];

students.forEach((student) => {
    units.forEach((unit) => {
        // Generate clearer patterns for demo purposes
        // Some students are generally good, some struggle with specific units (e.g., Calculus)
        let baseScore = Math.random() * 40 + 60; // 60-100 base
        if (unit === '미분' || unit === '적분') baseScore -= 15; // Harder units
        if (student === '김민수') baseScore += 10; // Top student

        heatmapData.push({
            student,
            unit,
            score: Math.min(100, Math.max(0, Math.round(baseScore))),
        });
    });
});

// 3. Activity Logs
export const activityLogs: ActivityLog[] = [
    { id: '1', title: '채점 완료', description: '고2 심화반 모의고사 채점이 완료되었습니다.', time: '방금 전', type: 'grading' },
    { id: '2', title: '클리닉 생성', description: '김철수 학생을 위한 미분 집중 클리닉이 생성되었습니다.', time: '15분 전', type: 'clinic' },
    { id: '3', title: '시스템 업데이트', description: '새로운 AI 문제 추천 알고리즘이 적용되었습니다.', time: '2시간 전', type: 'system' },
    { id: '4', title: '과제 제출', description: '중3 기하반 12명이 과제를 제출했습니다.', time: '3시간 전', type: 'grading' },
    { id: '5', title: '상담 예약', description: '이영희 학부모님 상담 예약이 확정되었습니다.', time: '5시간 전', type: 'system' },
];

// 4. Class Status
export const classStatus: ClassStatus[] = [
    { id: 'c1', name: '고2 수I 심화', time: '14:00 - 16:00', students: 12, status: 'active' },
    { id: 'c2', name: '중3 기하 특강', time: '16:30 - 18:00', students: 8, status: 'scheduled' },
    { id: 'c3', name: '고3 미적분 실전', time: '19:00 - 22:00', students: 24, status: 'scheduled' },
    { id: 'c4', name: '수II 기초반', time: '10:00 - 12:00', students: 6, status: 'finished' },
];

export const heatmapConfig = {
    students,
    units,
};
