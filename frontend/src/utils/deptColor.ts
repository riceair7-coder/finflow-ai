// 부서별 결정적 색상 매핑.
// Tailwind JIT가 인식할 수 있도록 모든 클래스 문자열을 정적으로 나열한다.

export interface DeptPalette {
  /** 작은 배지/칩 (cell, badge 안) */
  badge: string
  /** 좌측 인디케이터/도트 (bg-color-500) */
  dot: string
  /** 활성 탭 (border-bottom + text) */
  tabActive: string
  /** 비활성 탭 hover (text-color-700 hover:bg-color-50) — 옵션 */
  tabIdleHover: string
  /** 행 좌측 강조용 border-left */
  rowBorder: string
}

const PALETTE: DeptPalette[] = [
  // 1 blue
  {
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
    dot: 'bg-blue-500',
    tabActive: 'border-blue-600 text-blue-700',
    tabIdleHover: 'hover:text-blue-700 hover:bg-blue-50',
    rowBorder: 'border-l-4 border-l-blue-400',
  },
  // 2 emerald
  {
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    dot: 'bg-emerald-500',
    tabActive: 'border-emerald-600 text-emerald-700',
    tabIdleHover: 'hover:text-emerald-700 hover:bg-emerald-50',
    rowBorder: 'border-l-4 border-l-emerald-400',
  },
  // 3 amber
  {
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500',
    tabActive: 'border-amber-600 text-amber-700',
    tabIdleHover: 'hover:text-amber-700 hover:bg-amber-50',
    rowBorder: 'border-l-4 border-l-amber-400',
  },
  // 4 rose
  {
    badge: 'bg-rose-50 text-rose-700 border border-rose-200',
    dot: 'bg-rose-500',
    tabActive: 'border-rose-600 text-rose-700',
    tabIdleHover: 'hover:text-rose-700 hover:bg-rose-50',
    rowBorder: 'border-l-4 border-l-rose-400',
  },
  // 5 purple
  {
    badge: 'bg-purple-50 text-purple-700 border border-purple-200',
    dot: 'bg-purple-500',
    tabActive: 'border-purple-600 text-purple-700',
    tabIdleHover: 'hover:text-purple-700 hover:bg-purple-50',
    rowBorder: 'border-l-4 border-l-purple-400',
  },
  // 6 indigo
  {
    badge: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    dot: 'bg-indigo-500',
    tabActive: 'border-indigo-600 text-indigo-700',
    tabIdleHover: 'hover:text-indigo-700 hover:bg-indigo-50',
    rowBorder: 'border-l-4 border-l-indigo-400',
  },
  // 7 teal
  {
    badge: 'bg-teal-50 text-teal-700 border border-teal-200',
    dot: 'bg-teal-500',
    tabActive: 'border-teal-600 text-teal-700',
    tabIdleHover: 'hover:text-teal-700 hover:bg-teal-50',
    rowBorder: 'border-l-4 border-l-teal-400',
  },
  // 8 orange
  {
    badge: 'bg-orange-50 text-orange-700 border border-orange-200',
    dot: 'bg-orange-500',
    tabActive: 'border-orange-600 text-orange-700',
    tabIdleHover: 'hover:text-orange-700 hover:bg-orange-50',
    rowBorder: 'border-l-4 border-l-orange-400',
  },
  // 9 cyan
  {
    badge: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
    dot: 'bg-cyan-500',
    tabActive: 'border-cyan-600 text-cyan-700',
    tabIdleHover: 'hover:text-cyan-700 hover:bg-cyan-50',
    rowBorder: 'border-l-4 border-l-cyan-400',
  },
  // 10 pink
  {
    badge: 'bg-pink-50 text-pink-700 border border-pink-200',
    dot: 'bg-pink-500',
    tabActive: 'border-pink-600 text-pink-700',
    tabIdleHover: 'hover:text-pink-700 hover:bg-pink-50',
    rowBorder: 'border-l-4 border-l-pink-400',
  },
  // 11 lime
  {
    badge: 'bg-lime-50 text-lime-700 border border-lime-200',
    dot: 'bg-lime-500',
    tabActive: 'border-lime-600 text-lime-700',
    tabIdleHover: 'hover:text-lime-700 hover:bg-lime-50',
    rowBorder: 'border-l-4 border-l-lime-400',
  },
  // 12 sky
  {
    badge: 'bg-sky-50 text-sky-700 border border-sky-200',
    dot: 'bg-sky-500',
    tabActive: 'border-sky-600 text-sky-700',
    tabIdleHover: 'hover:text-sky-700 hover:bg-sky-50',
    rowBorder: 'border-l-4 border-l-sky-400',
  },
]

// 중립 색 — '전체', '미배정', undefined 부서에 사용
export const NEUTRAL: DeptPalette = {
  badge: 'bg-gray-100 text-gray-600 border border-gray-200',
  dot: 'bg-gray-400',
  tabActive: 'border-gray-700 text-gray-800',
  tabIdleHover: 'hover:text-gray-800 hover:bg-gray-50',
  rowBorder: 'border-l-4 border-l-gray-300',
}

function hashKey(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export interface DeptLike {
  id: string
  code?: string | null
}

/**
 * 부서 배열을 받아 코드 기준 정렬한 순서로 팔레트를 1:1 배정한다.
 * 팔레트 12색 안에서는 충돌 없음. 12개 초과 시 13번째부터 wrap-around.
 *
 * 반환 Map: code(없으면 id) → DeptPalette
 */
export function buildDeptPaletteMap(departments: DeptLike[]): Map<string, DeptPalette> {
  const sorted = [...departments].sort((a, b) => {
    const ka = (a.code || a.id).toLowerCase()
    const kb = (b.code || b.id).toLowerCase()
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
  const map = new Map<string, DeptPalette>()
  sorted.forEach((d, i) => {
    const key = d.code || d.id
    map.set(key, PALETTE[i % PALETTE.length])
  })
  return map
}

/**
 * 단일 부서 키로 팔레트를 조회한다. 모집단을 모를 때만 사용 — 충돌 가능.
 * 가능하면 buildDeptPaletteMap을 사용해 부서 목록 기준 unique 배정을 유지한다.
 */
export function deptPalette(key: string | null | undefined): DeptPalette {
  if (!key) return NEUTRAL
  return PALETTE[hashKey(key) % PALETTE.length]
}

/**
 * Map 기반 안전한 조회. key 없으면 NEUTRAL.
 */
export function lookupPalette(map: Map<string, DeptPalette>, key: string | null | undefined): DeptPalette {
  if (!key) return NEUTRAL
  return map.get(key) ?? deptPalette(key)
}
