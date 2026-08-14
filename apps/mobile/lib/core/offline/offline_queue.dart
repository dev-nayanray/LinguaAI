import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

/// A queued write this device couldn't make while offline — generic
/// (`endpoint`/`payload`), not exercise-attempt-specific, since the E21
/// design doc (§6.3) names two real future callers of this same queue
/// (exercise attempts here in T2, SRS reviews in T3) and a second
/// identically-shaped table for the second caller would be real,
/// avoidable duplication.
class PendingWrite {
  const PendingWrite({
    required this.id,
    required this.endpoint,
    required this.payload,
    required this.createdAt,
  });

  factory PendingWrite.fromRow(Map<String, Object?> row) => PendingWrite(
    id: row['id']! as int,
    endpoint: row['endpoint']! as String,
    payload: jsonDecode(row['payload']! as String) as Map<String, dynamic>,
    createdAt: DateTime.parse(row['createdAt']! as String),
  );

  final int id;
  final String endpoint;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
}

/// A real, on-device SQLite-backed FIFO queue (ADR-062 §6.3) — raw SQL via
/// `sqflite`, not `drift` (a disclosed deviation from the design doc's
/// original proposal, the same reasoning ADR-061 already gave for plain
/// Riverpod over its codegen variant: no `build_runner` step, and this
/// queue's own schema is simple enough not to need a typed query builder).
class OfflineQueue {
  OfflineQueue({Database? database}) : _databaseOverride = database;

  final Database? _databaseOverride;
  Database? _db;

  Future<Database> _open() async {
    if (_databaseOverride != null) {
      return _databaseOverride;
    }
    final existing = _db;
    if (existing != null) {
      return existing;
    }
    final dir = await getApplicationDocumentsDirectory();
    final path = p.join(dir.path, 'linguai_offline_queue.db');
    final opened = await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) => db.execute('''
        CREATE TABLE pending_writes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          endpoint TEXT NOT NULL,
          payload TEXT NOT NULL,
          createdAt TEXT NOT NULL
        )
      '''),
    );
    _db = opened;
    return opened;
  }

  Future<int> enqueue({required String endpoint, required Map<String, dynamic> payload}) async {
    final db = await _open();
    return db.insert('pending_writes', {
      'endpoint': endpoint,
      'payload': jsonEncode(payload),
      'createdAt': DateTime.now().toIso8601String(),
    });
  }

  /// FIFO order (`id ASC`) — replay must preserve original submission
  /// order (§6.3: "queued writes replay in original order").
  Future<List<PendingWrite>> listPending() async {
    final db = await _open();
    final rows = await db.query('pending_writes', orderBy: 'id ASC');
    return rows.map(PendingWrite.fromRow).toList();
  }

  Future<void> remove(int id) async {
    final db = await _open();
    await db.delete('pending_writes', where: 'id = ?', whereArgs: [id]);
  }
}
