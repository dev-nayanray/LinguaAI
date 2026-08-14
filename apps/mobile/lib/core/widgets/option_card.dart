import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// A tappable, selectable card used for multiple-choice/matching options —
/// the redesigned replacement for bare `RadioListTile`/`ListTile` rows, with
/// a visible selected/correct/incorrect state instead of only a filled radio
/// dot. Locking (`onTap: null`) once an outcome exists is the caller's job,
/// same as the plain `ListTile`s it replaces.
class OptionCard extends StatelessWidget {
  const OptionCard({
    required this.label,
    required this.selected,
    required this.onTap,
    this.leading,
    this.state = OptionCardState.neutral,
    super.key,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final Widget? leading;
  final OptionCardState state;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final scheme = Theme.of(context).colorScheme;
    final (borderColor, backgroundColor) = switch (state) {
      OptionCardState.correct => (colors.success, colors.success.withValues(alpha: 0.12)),
      OptionCardState.incorrect => (scheme.error, scheme.error.withValues(alpha: 0.12)),
      OptionCardState.neutral when selected => (scheme.primary, scheme.primary.withValues(alpha: 0.08)),
      OptionCardState.neutral => (colors.border.withValues(alpha: 0.3), colors.surfaceElevated),
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: backgroundColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(context.radii['md']),
        side: BorderSide(color: borderColor, width: selected || state != OptionCardState.neutral ? 2 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(context.radii['md']),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              if (leading != null) ...[leading!, const SizedBox(width: 12)],
              Expanded(child: Text(label, style: Theme.of(context).textTheme.bodyMedium)),
              if (state == OptionCardState.correct) Icon(Icons.check_circle, color: colors.success),
              if (state == OptionCardState.incorrect) Icon(Icons.cancel, color: scheme.error),
            ],
          ),
        ),
      ),
    );
  }
}

enum OptionCardState { neutral, correct, incorrect }
