import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/course/data/exercise_attempt_service.dart';
import 'package:mobile/features/course/domain/course_models.dart';
import 'package:mobile/features/course/presentation/course_providers.dart';
import 'package:mobile/features/course/presentation/exercise_screen.dart';
import 'package:mocktail/mocktail.dart';

class _MockExerciseAttemptService extends Mock implements ExerciseAttemptService {}

void main() {
  setUpAll(() {
    registerFallbackValue(const TextResponse('fallback'));
  });

  testWidgets('submitting a MULTIPLE_CHOICE answer shows the real scored outcome banner', (
    tester,
  ) async {
    const exercise = ExercisePublicView(
      id: 'ex-1',
      activityId: 'activity-1',
      quizId: null,
      type: 'MULTIPLE_CHOICE',
      prompt: 'How do you say hello?',
      order: 1,
      content: McOptionsContent(['Hola', 'Adiós']),
    );
    final service = _MockExerciseAttemptService();
    when(() => service.submit(any(), any())).thenAnswer(
      (_) async => const AttemptScored(
        ExerciseAttemptResult(id: 'attempt-1', isCorrect: true, score: 1),
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [exerciseAttemptServiceProvider.overrideWithValue(service)],
        child: const MaterialApp(home: ExerciseScreen(exercise: exercise)),
      ),
    );

    expect(find.text('Hola'), findsOneWidget);
    await tester.tap(find.text('Hola'));
    await tester.pump();

    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();

    expect(find.text('Correct!'), findsOneWidget);
    expect(find.text('Submit'), findsNothing);
    final captured = verify(() => service.submit('ex-1', captureAny())).captured.single
        as SelectedIndexResponse;
    expect(captured.selectedIndex, 0);
  });

  testWidgets('an offline submission shows the real Queued banner, not a scored outcome', (
    tester,
  ) async {
    const exercise = ExercisePublicView(
      id: 'ex-3',
      activityId: 'activity-1',
      quizId: null,
      type: 'TRANSLATION',
      prompt: 'Translate "goodbye"',
      order: 1,
      content: null,
    );
    final service = _MockExerciseAttemptService();
    when(() => service.submit(any(), any())).thenAnswer((_) async => const AttemptQueued());

    await tester.pumpWidget(
      ProviderScope(
        overrides: [exerciseAttemptServiceProvider.overrideWithValue(service)],
        child: const MaterialApp(home: ExerciseScreen(exercise: exercise)),
      ),
    );

    await tester.enterText(find.byType(TextField), 'Adios');
    await tester.pump();
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Saved offline'), findsOneWidget);
  });

  testWidgets('a MULTIPLE_CHOICE exercise with no content shows an honest unsupported notice', (
    tester,
  ) async {
    const exercise = ExercisePublicView(
      id: 'ex-2',
      activityId: 'activity-1',
      quizId: null,
      type: 'MULTIPLE_CHOICE',
      prompt: 'Legacy exercise with no options data',
      order: 1,
      content: null,
    );

    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: ExerciseScreen(exercise: exercise))),
    );

    expect(find.textContaining("can't be answered yet"), findsOneWidget);
  });
}
