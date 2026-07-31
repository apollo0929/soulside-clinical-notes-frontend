export const TRANSITION_SOURCES = ['USER', 'SERVER', 'SYSTEM'] as const

export type TransitionSource = (typeof TRANSITION_SOURCES)[number]
