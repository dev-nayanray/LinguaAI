import 'package:flutter/material.dart';

/// A labelled stat used on the progress/home surfaces (level, XP, streak) —
/// an icon + big value + small label, replacing a bare `Column` of two
/// `Text` widgets so every stat reads as a real UI element, not a table cell.
class StatPill extends StatelessWidget {
  const StatPill({required this.icon, required this.value, required this.label, this.color, super.key});

  final IconData icon;
  final String value;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final tint = color ?? Theme.of(context).colorScheme.primary;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: tint, size: 22),
        const SizedBox(height: 4),
        Text(value, style: Theme.of(context).textTheme.headlineMedium),
        Text(label, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}
