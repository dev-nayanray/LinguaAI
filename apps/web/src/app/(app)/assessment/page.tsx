'use client';

import { useState } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';
import type {
  AssessmentItemPublicView,
  CompleteAssessmentAttemptResponse,
} from '@linguaai/validation/learning';
import { Button } from '@linguaai/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@linguaai/ui/cards';
import { CefrBadge } from '@linguaai/ui/progress';

import { useCourses } from '@/lib/api/courses';
import {
  useCompleteAssessmentAttempt,
  useStartAssessmentAttempt,
  useSubmitAssessmentResponse,
} from '@/lib/api/assessment';

/**
 * `assessmentItemPublicViewSchema` carries no answer-option content for
 * `MULTIPLE_CHOICE` items on this branch — the same class of gap
 * `/lessons/[lessonId]` found for exercises (docs/WEB_DESIGN.md §1a/1c).
 * Only `FILL_IN_BLANK`/`OPEN_RESPONSE` (free-text) items are genuinely
 * answerable here; a served `MULTIPLE_CHOICE` item shows an honest notice
 * instead of a form with nothing to select from.
 */
const ANSWERABLE_TYPES = new Set(['FILL_IN_BLANK', 'OPEN_RESPONSE']);

type Stage =
  | { kind: 'idle' }
  | { kind: 'in-progress'; attemptId: string; item: AssessmentItemPublicView }
  | { kind: 'completed'; result: CompleteAssessmentAttemptResponse };

export default function AssessmentPage() {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const courses = useCourses();
  const start = useStartAssessmentAttempt();
  const submit = useSubmitAssessmentResponse();
  const complete = useCompleteAssessmentAttempt();

  // No /v1/languages catalog exists on this branch (docs/WEB_DESIGN.md
  // §1b) — the course catalog's own languageId is the only real one
  // reachable here, same workaround /vocabulary already uses.
  const languageId = courses.data?.data[0]?.languageId;

  function onStart() {
    if (!languageId) {
      return;
    }
    start.mutate(languageId, {
      onSuccess: (res) =>
        setStage({ kind: 'in-progress', attemptId: res.attempt.id, item: res.nextItem }),
    });
  }

  function onSubmit(attemptId: string, itemId: string, text: string) {
    submit.mutate(
      { attemptId, body: { itemId, response: { text: text.trim() } } },
      {
        onSuccess: (res) => {
          if (res.nextItem) {
            setStage({ kind: 'in-progress', attemptId, item: res.nextItem });
          } else {
            complete.mutate(attemptId, {
              onSuccess: (result) => setStage({ kind: 'completed', result }),
            });
          }
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 tablet:px-6">
      <h1 className="type-heading-xl text-text">Assessment</h1>

      {stage.kind === 'idle' && (
        <Card className="mt-6">
          <CardHeader>
            <Sparkles className="h-6 w-6 text-ai-text" aria-hidden="true" />
            <CardTitle className="mt-2">Find your level</CardTitle>
            <CardDescription>
              A short, adaptive placement assessment resolves your real CEFR level per skill and
              builds your learning plan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="primary"
              loading={start.isPending}
              disabled={!languageId}
              onClick={onStart}
            >
              Start assessment
            </Button>
            {start.isError && (
              <p className="mt-3 type-body-sm text-danger-text">Could not start your assessment.</p>
            )}
          </CardContent>
        </Card>
      )}

      {stage.kind === 'in-progress' && (
        <AssessmentItemCard
          key={stage.item.id}
          attemptId={stage.attemptId}
          item={stage.item}
          submitting={submit.isPending || complete.isPending}
          onSubmit={(text) => onSubmit(stage.attemptId, stage.item.id, text)}
        />
      )}

      {stage.kind === 'completed' && (
        <div className="mt-6 space-y-4">
          {stage.result.retakeRecommended && (
            <Card className="border-warning-solid">
              <CardContent className="flex items-center gap-3 pt-6">
                <AlertCircle className="h-5 w-5 shrink-0 text-warning-text" aria-hidden="true" />
                <p className="type-body-sm text-neutral-text">
                  Some results were low-confidence — consider retaking the assessment for a more
                  reliable placement.
                </p>
              </CardContent>
            </Card>
          )}
          {stage.result.proficiencyLevels.map((level) => (
            <Card key={level.skill}>
              <CardContent className="flex items-center justify-between gap-4 pt-6">
                <div>
                  <p className="type-body-md font-semibold text-text">{level.skill}</p>
                  {level.lowConfidence && (
                    <p className="type-caption text-warning-text">Low confidence</p>
                  )}
                </div>
                <CefrBadge level={level.cefrLevel} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AssessmentItemCard({
  item,
  submitting,
  onSubmit,
}: {
  attemptId: string;
  item: AssessmentItemPublicView;
  submitting: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const answerable = ANSWERABLE_TYPES.has(item.itemType);

  return (
    <Card className="mt-6">
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex items-center gap-2">
          <span className="rounded-pill border border-border px-2 py-0.5 type-caption text-neutral-text">
            {item.skill}
          </span>
          <CefrBadge level={item.cefrLevel} />
        </div>
        <p className="type-body-lg text-text">{item.prompt}</p>

        {!answerable && (
          <p className="type-body-sm text-neutral-text">
            This item type isn't answerable here yet — its answer options aren't served by the API
            yet.
          </p>
        )}

        {answerable && (
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
              loading={submitting}
              disabled={!text.trim()}
              onClick={() => onSubmit(text)}
            >
              Submit
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
