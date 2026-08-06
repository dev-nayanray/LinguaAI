// E3 T7 — DESIGN_SYSTEM.md §4's Cards category: base card, stat card,
// lesson card, achievement card. The latter three are composed from the
// base card's own slots (§12.5), not separate implementations.
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
export { StatCard, type StatCardProps, type StatCardTrend } from './stat-card';
export { LessonCard, type LessonCardProps, type LessonStatus } from './lesson-card';
export { AchievementCard, type AchievementCardProps } from './achievement-card';
