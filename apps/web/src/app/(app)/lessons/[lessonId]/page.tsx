import { LessonDetailView } from './lesson-detail-view';

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <LessonDetailView lessonId={lessonId} />;
}
