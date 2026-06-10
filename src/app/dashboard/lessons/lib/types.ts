// 담임 운영 타입 — mathsecr 의존 제거, 자체 도메인.

export type NodeStatus = 'alpha' | 'beta' | 'gamma' | 'unknown';
export type ErrorCause = '개념' | '유형' | '계산' | '문장제' | '시간';

export const STATUS_COLOR: Record<NodeStatus, string> = {
  alpha:   '#4A7C59',
  beta:    '#C8A265',
  gamma:   '#B44641',
  unknown: '#D8D3CA',
};

export const STATUS_LABEL: Record<NodeStatus, string> = {
  alpha:   'α 마스터',
  beta:    'β 안정',
  gamma:   'γ 불안정',
  unknown: '미측정',
};
