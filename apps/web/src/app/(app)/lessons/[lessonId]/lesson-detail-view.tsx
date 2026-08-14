'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@linguaai/ui';
import { Card, CardContent } from '@linguaai/ui/cards';

import { useLessonDetail, useSubmitExerciseAttempt } from '@/lib/api/courses';

/**
 * `exercisePublicViewSchema` on this branch carries no `content` field —
 * the options/leftItems/rightItems MULTIPLE_CHOICE/MATCHING/LISTENING_
 * COMPREHENSION need to even render aren't in the payload yet (a real,
 * disclosed backend gap, see docs/WEB_DESIGN.md §1). Only free-text types
 * are genuinely answerable through this page today; everything else gets
 * an honest "not answerable yet" notice instead of a form with nothing to
 * fill in.
 */
const ANSWERABLE_TYPES = new Set(['FILL_BLANK', 'TRANSLATION']);

export function LessonDetailView({ lessonId }: { lessonId: string }) {
  const { data, isLoading, isError, refetch } = useLessonDetail(lessonId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 tablet:px-6">
      {isLoading && (
        <div className="space-y-3">
          <div className="h-8 w-2/3 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-24 w-full animate-pulse rounded-lg bg-surface-muted" />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <p className="type-body-sm text-neutral-text">Could not load this lesson.</p>
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

          {data.activities.every((activity) => activity.exercises.length === 0) && (
            <Card className="mt-6">
              <CardContent className="pt-6">
                <p className="type-body-sm text-neutral-text">This lesson has no exercises yet.</p>
              </CardContent>
            </Card>
          )}

          <div className="mt-6 space-y-6">
            {data.activities.map((activity) => (
              <div key={activity.id}>
                <h2 className="type-heading-md text-text">{activity.title}</h2>
                <div className="mt-3 space-y-3">
                  {activity.exercises.map((exercise) => (
                    <ExerciseCard
                      key={exercise.id}
                      exerciseId={exercise.id}
                      type={exercise.type}
                      prompt={exercise.prompt}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ExerciseCard({
  exerciseId,
  type,
  prompt,
}: {
  exerciseId: string;
  type: string;
  prompt: string;
}) {
  const [text, setText] = useState('');
  const { mutate, data: result, isPending, isError, error } = useSubmitExerciseAttempt();
  const answerable = ANSWERABLE_TYPES.has(type);

  function onSubmit() {
    if (!text.trim()) {
      return;
    }
    mutate({ exerciseId, response: { text: text.trim() } });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-start justify-between gap-2">
          <p className="type-body-md text-text">{prompt}</p>
          <span className="shrink-0 rounded-pill border border-border px-2 py-0.5 type-caption text-neutral-text">
            {type}
          </span>
        </div>

        {!answerable && (
          <p className="type-body-sm text-neutral-text">
            {type === 'SPEAKING_PROMPT'
              ? 'Speaking exercises need live voice scoring — not yet available on the web app.'
              : "This exercise type isn't answerable here yet — its answer options aren't served by the API yet."}
          </p>
        )}

        {answerable && !result && (
          <div className="flex flex-col gap-2 tablet:flex-row">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Your answer"
              className="flex-1 rounded-md border border-border bg-surface-muted px-3 py-2 type-body-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            />
            <Button
              variant="primary"
              loading={isPending}
              disabled={!text.trim()}
              onClick={onSubmit}
            >
              Submit
            </Button>
          </div>
        )}

        {isError && (
          <p className="type-body-sm text-danger-text">
            {error instanceof Error ? error.message : 'Could not submit your answer.'}
          </p>
        )}

        {result && (
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-2 type-body-sm ${
              result.isCorrect
                ? 'bg-success/10 text-success-text'
                : 'bg-danger-solid/10 text-danger-text'
            }`}
          >
            {result.isCorrect ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            )}
            {result.isCorrect ? 'Correct!' : 'Not quite — keep practicing.'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
