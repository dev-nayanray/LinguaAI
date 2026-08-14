'use client';

import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@linguaai/ui/cards';
import { CefrBadge } from '@linguaai/ui/progress';

import { useCourseDetail } from '@/lib/api/courses';

export function CourseDetailView({ courseId }: { courseId: string }) {
  const { data, isLoading, isError, refetch } = useCourseDetail(courseId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 tablet:px-6">
      {isLoading && (
        <div className="space-y-3">
          <div className="h-8 w-2/3 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-24 w-full animate-pulse rounded-lg bg-surface-muted" />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <p className="type-body-sm text-neutral-text">Could not load this course.</p>
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

      {!isLoading && !isError && data && (
        <>
          <h1 className="type-heading-xl text-text">{data.title}</h1>
          {data.description && (
            <p className="mt-2 type-body-md text-neutral-text">{data.description}</p>
          )}

          {data.levels.length === 0 && (
            <Card className="mt-6">
              <CardContent className="pt-6">
                <p className="type-body-sm text-neutral-text">This course has no content yet.</p>
              </CardContent>
            </Card>
          )}

          <div className="mt-6 space-y-3">
            {data.levels.map((level) => (
              <details key={level.id} className="rounded-lg border border-border bg-surface" open>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <CefrBadge level={level.cefrLevel} />
                  <span className="type-heading-md text-text">{level.title}</span>
                </summary>
                <div className="border-t border-border px-4 py-2">
                  {level.units.map((unit) => (
                    <div key={unit.id} className="py-2">
                      <p className="type-body-sm font-semibold text-text">{unit.title}</p>
                      <ul className="mt-2 space-y-1">
                        {unit.lessons.map((lesson) => (
                          <li key={lesson.id}>
                            <a
                              href={`/lessons/${lesson.id}`}
                              className="flex items-center justify-between gap-2 rounded-md px-2 py-2 type-body-sm text-neutral-text transition-colors duration-micro hover:bg-surface-muted hover:text-text"
                            >
                              <span>{lesson.title}</span>
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </a>
                          </li>
                        ))}
                        {unit.lessons.length === 0 && (
                          <li className="type-body-sm text-neutral-text">No lessons yet.</li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
