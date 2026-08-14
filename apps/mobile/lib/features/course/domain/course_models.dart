/// Mirrors `courseSchema` (`@linguaai/validation/content`) field-for-field.
class CourseSummary {
  const CourseSummary({
    required this.id,
    required this.languageId,
    required this.title,
    required this.description,
    required this.slug,
    required this.publishedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory CourseSummary.fromJson(Map<String, dynamic> json) => CourseSummary(
    id: json['id'] as String,
    languageId: json['languageId'] as String,
    title: json['title'] as String,
    description: json['description'] as String?,
    slug: json['slug'] as String,
    publishedAt: json['publishedAt'] as String?,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );

  final String id;
  final String languageId;
  final String title;
  final String? description;
  final String slug;
  final String? publishedAt;
  final String createdAt;
  final String updatedAt;
}

/// Mirrors `courseListResponseSchema`.
class CourseListResult {
  const CourseListResult({required this.data, required this.page, required this.pageSize, required this.total});

  factory CourseListResult.fromJson(Map<String, dynamic> json) => CourseListResult(
    data: (json['data'] as List<dynamic>)
        .map((entry) => CourseSummary.fromJson(entry as Map<String, dynamic>))
        .toList(),
    page: (json['meta'] as Map<String, dynamic>)['page'] as int,
    pageSize: (json['meta'] as Map<String, dynamic>)['pageSize'] as int,
    total: (json['meta'] as Map<String, dynamic>)['total'] as int,
  );

  final List<CourseSummary> data;
  final int page;
  final int pageSize;
  final int total;
}

/// Mirrors `lessonSchema` (the shallow, list-item shape nested under a Unit).
class LessonSummary {
  const LessonSummary({
    required this.id,
    required this.unitId,
    required this.title,
    required this.description,
    required this.order,
    required this.estimatedMinutes,
  });

  factory LessonSummary.fromJson(Map<String, dynamic> json) => LessonSummary(
    id: json['id'] as String,
    unitId: json['unitId'] as String,
    title: json['title'] as String,
    description: json['description'] as String?,
    order: json['order'] as int,
    estimatedMinutes: json['estimatedMinutes'] as int?,
  );

  final String id;
  final String unitId;
  final String title;
  final String? description;
  final int order;
  final int? estimatedMinutes;
}

/// Mirrors `unitSchema.extend({ lessons })` as nested under `CourseDetail`.
class UnitDetail {
  const UnitDetail({
    required this.id,
    required this.levelId,
    required this.title,
    required this.description,
    required this.order,
    required this.lessons,
  });

  factory UnitDetail.fromJson(Map<String, dynamic> json) => UnitDetail(
    id: json['id'] as String,
    levelId: json['levelId'] as String,
    title: json['title'] as String,
    description: json['description'] as String?,
    order: json['order'] as int,
    lessons: (json['lessons'] as List<dynamic>)
        .map((entry) => LessonSummary.fromJson(entry as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String levelId;
  final String title;
  final String? description;
  final int order;
  final List<LessonSummary> lessons;
}

/// Mirrors `levelSchema.extend({ units })` as nested under `CourseDetail`.
class LevelDetail {
  const LevelDetail({
    required this.id,
    required this.courseId,
    required this.cefrLevel,
    required this.title,
    required this.description,
    required this.order,
    required this.units,
  });

  factory LevelDetail.fromJson(Map<String, dynamic> json) => LevelDetail(
    id: json['id'] as String,
    courseId: json['courseId'] as String,
    cefrLevel: json['cefrLevel'] as String,
    title: json['title'] as String,
    description: json['description'] as String?,
    order: json['order'] as int,
    units: (json['units'] as List<dynamic>)
        .map((entry) => UnitDetail.fromJson(entry as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String courseId;
  final String cefrLevel;
  final String title;
  final String? description;
  final int order;
  final List<UnitDetail> units;
}

/// Mirrors `courseDetailResponseSchema` — `GET /v1/courses/:id`.
class CourseDetail {
  const CourseDetail({required this.summary, required this.levels});

  factory CourseDetail.fromJson(Map<String, dynamic> json) => CourseDetail(
    summary: CourseSummary.fromJson(json),
    levels: (json['levels'] as List<dynamic>)
        .map((entry) => LevelDetail.fromJson(entry as Map<String, dynamic>))
        .toList(),
  );

  final CourseSummary summary;
  final List<LevelDetail> levels;
}

/// Mirrors `exercisePublicViewSchema`'s own `content` union (E21 T2's own
/// found-and-fixed gap — see that schema's doc comment in
/// `packages/validation/src/content/index.ts`).
sealed class ExerciseContent {
  const ExerciseContent();

  static ExerciseContent? fromJson(dynamic json) {
    if (json == null) {
      return null;
    }
    final map = json as Map<String, dynamic>;
    if (map.containsKey('options')) {
      return McOptionsContent((map['options'] as List<dynamic>).cast<String>());
    }
    return MatchingItemsContent(
      leftItems: (map['leftItems'] as List<dynamic>).cast<String>(),
      rightItems: (map['rightItems'] as List<dynamic>).cast<String>(),
    );
  }
}

class McOptionsContent extends ExerciseContent {
  const McOptionsContent(this.options);

  final List<String> options;
}

class MatchingItemsContent extends ExerciseContent {
  const MatchingItemsContent({required this.leftItems, required this.rightItems});

  final List<String> leftItems;
  final List<String> rightItems;
}

/// Mirrors `exercisePublicViewSchema` — `correctAnswer`/`correctIndex`
/// never present, by construction (never parsed here at all).
class ExercisePublicView {
  const ExercisePublicView({
    required this.id,
    required this.activityId,
    required this.quizId,
    required this.type,
    required this.prompt,
    required this.order,
    required this.content,
  });

  factory ExercisePublicView.fromJson(Map<String, dynamic> json) => ExercisePublicView(
    id: json['id'] as String,
    activityId: json['activityId'] as String,
    quizId: json['quizId'] as String?,
    type: json['type'] as String,
    prompt: json['prompt'] as String,
    order: json['order'] as int,
    content: ExerciseContent.fromJson(json['content']),
  );

  final String id;
  final String activityId;
  final String? quizId;
  final String type;
  final String prompt;
  final int order;
  final ExerciseContent? content;
}

/// Mirrors `quizSchema`.
class QuizSummary {
  const QuizSummary({
    required this.id,
    required this.activityId,
    required this.title,
    required this.passingScorePercent,
    required this.order,
  });

  factory QuizSummary.fromJson(Map<String, dynamic> json) => QuizSummary(
    id: json['id'] as String,
    activityId: json['activityId'] as String,
    title: json['title'] as String,
    passingScorePercent: json['passingScorePercent'] as int?,
    order: json['order'] as int,
  );

  final String id;
  final String activityId;
  final String title;
  final int? passingScorePercent;
  final int order;
}

/// Mirrors `activityBaseSchema.extend({ exercises, quizzes })` as nested
/// under `LessonDetail`.
class ActivityDetail {
  const ActivityDetail({
    required this.id,
    required this.lessonId,
    required this.type,
    required this.title,
    required this.content,
    required this.order,
    required this.exercises,
    required this.quizzes,
  });

  factory ActivityDetail.fromJson(Map<String, dynamic> json) => ActivityDetail(
    id: json['id'] as String,
    lessonId: json['lessonId'] as String,
    type: json['type'] as String,
    title: json['title'] as String,
    content: json['content'] as Map<String, dynamic>,
    order: json['order'] as int,
    exercises: (json['exercises'] as List<dynamic>)
        .map((entry) => ExercisePublicView.fromJson(entry as Map<String, dynamic>))
        .toList(),
    quizzes: (json['quizzes'] as List<dynamic>)
        .map((entry) => QuizSummary.fromJson(entry as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String lessonId;
  final String type;
  final String title;
  final Map<String, dynamic> content;
  final int order;
  final List<ExercisePublicView> exercises;
  final List<QuizSummary> quizzes;
}

/// Mirrors `lessonDetailResponseSchema` — `GET /v1/lessons/:id`.
class LessonDetail {
  const LessonDetail({required this.summary, required this.activities});

  factory LessonDetail.fromJson(Map<String, dynamic> json) => LessonDetail(
    summary: LessonSummary.fromJson(json),
    activities: (json['activities'] as List<dynamic>)
        .map((entry) => ActivityDetail.fromJson(entry as Map<String, dynamic>))
        .toList(),
  );

  final LessonSummary summary;
  final List<ActivityDetail> activities;
}

/// Mirrors `exerciseAttemptResultResponseSchema` — the real, synchronous
/// `POST /v1/exercises/:id/attempts` response. No `lessonCompleted`/XP
/// field exists here (a real, confirmed gap in the current contract, not a
/// missed field on this model) — `learning.lesson.completed`/gamification
/// are fire-and-forget server-side side effects, never echoed back.
class ExerciseAttemptResult {
  const ExerciseAttemptResult({required this.id, required this.isCorrect, required this.score});

  factory ExerciseAttemptResult.fromJson(Map<String, dynamic> json) => ExerciseAttemptResult(
    id: json['id'] as String,
    isCorrect: json['isCorrect'] as bool,
    score: (json['score'] as num?)?.toDouble(),
  );

  final String id;
  final bool isCorrect;
  final double? score;
}

/// Mirrors `submitExerciseAttemptResponseValueSchema` — a plain union, no
/// client-supplied discriminant field; the server infers shape from the
/// real `Exercise.type` it already knows.
sealed class ExerciseResponseValue {
  const ExerciseResponseValue();

  Map<String, dynamic> toJson();
}

class SelectedIndexResponse extends ExerciseResponseValue {
  const SelectedIndexResponse(this.selectedIndex);

  final int selectedIndex;

  @override
  Map<String, dynamic> toJson() => {'selectedIndex': selectedIndex};
}

class TextResponse extends ExerciseResponseValue {
  const TextResponse(this.text);

  final String text;

  @override
  Map<String, dynamic> toJson() => {'text': text};
}

class MatchPair {
  const MatchPair({required this.left, required this.right});

  final String left;
  final String right;

  Map<String, dynamic> toJson() => {'left': left, 'right': right};
}

class MatchesResponse extends ExerciseResponseValue {
  const MatchesResponse(this.matches);

  final List<MatchPair> matches;

  @override
  Map<String, dynamic> toJson() => {'matches': matches.map((pair) => pair.toJson()).toList()};
}

/// The mobile app's own outcome of a submission attempt — `Scored` mirrors
/// a real server response; `Queued` (§6.3, ADR-062) means the network call
/// itself couldn't be made and the write was persisted to `OfflineQueue`
/// instead, so no real `isCorrect`/`score` exists yet.
sealed class AttemptOutcome {
  const AttemptOutcome();
}

class AttemptScored extends AttemptOutcome {
  const AttemptScored(this.result);

  final ExerciseAttemptResult result;
}

class AttemptQueued extends AttemptOutcome {
  const AttemptQueued();
}
