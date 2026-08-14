'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@linguaai/ui/cards';

import { useCourses } from '@/lib/api/courses';

export default function CoursesPage() {
  const { data, isLoading, isError, refetch } = useCourses();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 tablet:px-6">
      <h1 className="type-heading-xl text-text">Courses</h1>
      <p className="mt-1 type-body-sm text-neutral-text">Browse the published course catalog.</p>

      {isLoading && (
        <div className="mt-6 grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-5 w-2/3 animate-pulse rounded-md bg-surface-muted" />
                <div className="mt-2 h-4 w-full animate-pulse rounded-md bg-surface-muted" />
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <Card className="mt-6">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <p className="type-body-sm text-neutral-text">Could not load courses.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="type-body-sm font-semibold text-primary-text hover:underline"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data?.data.length === 0 && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="type-body-sm text-neutral-text">No courses are published yet.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && data.data.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {data.data.map((course) => (
            <Card key={course.id}>
              <CardHeader>
                <CardTitle>{course.title}</CardTitle>
                {course.description && <CardDescription>{course.description}</CardDescription>}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
