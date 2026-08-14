import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AssessmentPage from './page';

const useCoursesMock = vi.fn();
const useStartAssessmentAttemptMock = vi.fn();
const useSubmitAssessmentResponseMock = vi.fn();
const useCompleteAssessmentAttemptMock = vi.fn();

vi.mock('@/lib/api/courses', () => ({
  useCourses: () => useCoursesMock(),
}));

vi.mock('@/lib/api/assessment', () => ({
  useStartAssessmentAttempt: () => useStartAssessmentAttemptMock(),
  useSubmitAssessmentResponse: () => useSubmitAssessmentResponseMock(),
  useCompleteAssessmentAttempt: () => useCompleteAssessmentAttemptMock(),
}));

const fillInBlankItem = {
  id: 'item-1',
  skill: 'VOCABULARY',
  cefrLevel: 'A1',
  difficulty: 1,
  prompt: 'Fill in the blank: "___ , how are you?"',
  audioUrl: null,
  itemType: 'FILL_IN_BLANK',
};

const multipleChoiceItem = {
  id: 'item-2',
  skill: 'READING',
  cefrLevel: 'A1',
  difficulty: 1,
  prompt: 'Choose the correct word',
  audioUrl: null,
  itemType: 'MULTIPLE_CHOICE',
};

function setupDefaults() {
  useCoursesMock.mockReturnValue({
    data: { data: [{ id: 'course-1', languageId: 'lang-1' }], meta: {} },
  });
  useStartAssessmentAttemptMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  });
  useSubmitAssessmentResponseMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useCompleteAssessmentAttemptMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

describe('AssessmentPage', () => {
  it('starting the assessment calls start with the real languageId and shows the first item', async () => {
    setupDefaults();
    const startMutate = vi.fn((_languageId: string, opts: { onSuccess: (r: unknown) => void }) => {
      opts.onSuccess({ attempt: { id: 'attempt-1' }, nextItem: fillInBlankItem });
    });
    useStartAssessmentAttemptMock.mockReturnValue({
      mutate: startMutate,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();

    render(<AssessmentPage />);
    await user.click(screen.getByRole('button', { name: 'Start assessment' }));

    expect(startMutate).toHaveBeenCalledWith('lang-1', expect.any(Object));
    expect(await screen.findByText(fillInBlankItem.prompt)).toBeInTheDocument();
  });

  it('shows an honest notice for a served MULTIPLE_CHOICE item (no answer options in the payload)', async () => {
    setupDefaults();
    const startMutate = vi.fn((_languageId: string, opts: { onSuccess: (r: unknown) => void }) => {
      opts.onSuccess({ attempt: { id: 'attempt-1' }, nextItem: multipleChoiceItem });
    });
    useStartAssessmentAttemptMock.mockReturnValue({
      mutate: startMutate,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();

    render(<AssessmentPage />);
    await user.click(screen.getByRole('button', { name: 'Start assessment' }));

    expect(await screen.findByText(multipleChoiceItem.prompt)).toBeInTheDocument();
    expect(screen.getByText(/isn't answerable here yet/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Your answer')).not.toBeInTheDocument();
  });

  it('submitting the final item completes the attempt and shows the real banded results', async () => {
    setupDefaults();
    const startMutate = vi.fn((_languageId: string, opts: { onSuccess: (r: unknown) => void }) => {
      opts.onSuccess({ attempt: { id: 'attempt-1' }, nextItem: fillInBlankItem });
    });
    const submitMutate = vi.fn((_vars: unknown, opts: { onSuccess: (r: unknown) => void }) => {
      opts.onSuccess({
        response: { id: 'r-1', isCorrect: true, score: 1 },
        nextItem: null,
        attemptStatus: 'COMPLETED',
      });
    });
    const completeMutate = vi.fn(
      (_attemptId: string, opts: { onSuccess: (r: unknown) => void }) => {
        opts.onSuccess({
          attempt: { id: 'attempt-1' },
          responses: [],
          proficiencyLevels: [
            { skill: 'VOCABULARY', cefrLevel: 'A2', confidence: 0.9, lowConfidence: false },
          ],
          retakeRecommended: false,
        });
      },
    );
    useStartAssessmentAttemptMock.mockReturnValue({
      mutate: startMutate,
      isPending: false,
      isError: false,
    });
    useSubmitAssessmentResponseMock.mockReturnValue({ mutate: submitMutate, isPending: false });
    useCompleteAssessmentAttemptMock.mockReturnValue({ mutate: completeMutate, isPending: false });
    const user = userEvent.setup();

    render(<AssessmentPage />);
    await user.click(screen.getByRole('button', { name: 'Start assessment' }));
    await user.type(await screen.findByPlaceholderText('Your answer'), 'hola');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(completeMutate).toHaveBeenCalledWith('attempt-1', expect.any(Object));
    expect(await screen.findByText('VOCABULARY')).toBeInTheDocument();
  });
});
