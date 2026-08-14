import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/auth_controller.dart';
import '../data/vocabulary_api.dart';

final vocabularyApiProvider = Provider<VocabularyApi>(
  (ref) => VocabularyApi(ref.watch(apiClientProvider).dio),
);
