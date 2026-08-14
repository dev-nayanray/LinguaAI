import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/offline/offline_queue.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  late Database database;
  late OfflineQueue queue;

  setUpAll(() {
    sqfliteFfiInit();
  });

  setUp(() async {
    database = await databaseFactoryFfi.openDatabase(
      inMemoryDatabasePath,
      options: OpenDatabaseOptions(
        version: 1,
        onCreate: (db, version) => db.execute('''
          CREATE TABLE pending_writes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL,
            payload TEXT NOT NULL,
            createdAt TEXT NOT NULL
          )
        '''),
      ),
    );
    queue = OfflineQueue(database: database);
  });

  tearDown(() => database.close());

  test('enqueue then listPending round-trips the real payload through a real SQLite table', () async {
    await queue.enqueue(
      endpoint: '/exercises/ex-1/attempts',
      payload: {
        'response': {'selectedIndex': 2},
      },
    );

    final pending = await queue.listPending();

    expect(pending, hasLength(1));
    expect(pending.single.endpoint, '/exercises/ex-1/attempts');
    expect(pending.single.payload, {
      'response': {'selectedIndex': 2},
    });
  });

  test('listPending returns entries in FIFO order (id ASC), not insertion-order-agnostic', () async {
    await queue.enqueue(endpoint: '/exercises/first/attempts', payload: {'response': 1});
    await queue.enqueue(endpoint: '/exercises/second/attempts', payload: {'response': 2});
    await queue.enqueue(endpoint: '/exercises/third/attempts', payload: {'response': 3});

    final pending = await queue.listPending();

    expect(pending.map((w) => w.endpoint), [
      '/exercises/first/attempts',
      '/exercises/second/attempts',
      '/exercises/third/attempts',
    ]);
  });

  test('remove deletes exactly the targeted row, leaving the rest of the queue intact', () async {
    final firstId = await queue.enqueue(endpoint: '/exercises/first/attempts', payload: {});
    await queue.enqueue(endpoint: '/exercises/second/attempts', payload: {});

    await queue.remove(firstId);
    final pending = await queue.listPending();

    expect(pending, hasLength(1));
    expect(pending.single.endpoint, '/exercises/second/attempts');
  });

  test('an empty queue returns an empty list, not null or an error', () async {
    final pending = await queue.listPending();

    expect(pending, isEmpty);
  });
}
