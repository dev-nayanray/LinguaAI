import 'package:dio/dio.dart';

/// Paths that must never trigger the 401→refresh→retry cycle below — each
/// is either the credential-check itself (a 401 there is a real "wrong
/// password", not an expired session) or the refresh call itself (retrying
/// a failed refresh with another refresh would loop forever).
const _refreshExemptPaths = {'/auth/login', '/auth/register', '/auth/refresh', '/auth/mfa/challenge'};

/// Wraps a single `Dio` instance for every `/v1/*` call this app makes.
/// Two responsibilities, both real, both load-bearing:
///  1. Every request carries `X-Client-Platform: mobile` (E21 T1's own
///     found gap/fix in `apps/api/src/modules/auth/auth.controller.ts`) —
///     one place this ever gets set, not one per call site.
///  2. A 401 on an ordinary (non-auth-exempt) request triggers exactly one
///     concurrent refresh attempt (`_refreshInFlight` de-dupes a burst of
///     simultaneous 401s sharing one refresh, not one each), then retries
///     the original request once with the new access token. A failed
///     refresh calls `onSessionExpired` and forwards the original error —
///     this class never decides what "session expired" means for the UI,
///     only that it happened.
class ApiClient {
  ApiClient({required String baseUrl, Dio? dio})
    : _dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: baseUrl,
              headers: const {'X-Client-Platform': 'mobile'},
              contentType: 'application/json',
            ),
          ) {
    _dio.interceptors.add(InterceptorsWrapper(onRequest: _onRequest, onError: _onError));
  }

  final Dio _dio;
  String? _accessToken;
  Future<String?>? _refreshInFlight;

  Future<String?> Function()? refreshAccessToken;
  void Function()? onSessionExpired;

  Dio get dio => _dio;

  void setAccessToken(String? token) {
    _accessToken = token;
  }

  void _onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (_accessToken != null && !options.headers.containsKey('Authorization')) {
      options.headers['Authorization'] = 'Bearer $_accessToken';
    }
    handler.next(options);
  }

  Future<void> _onError(DioException err, ErrorInterceptorHandler handler) async {
    final requestPath = err.requestOptions.path;
    final isRetry = err.requestOptions.extra['retried'] == true;
    if (err.response?.statusCode != 401 ||
        _refreshExemptPaths.contains(requestPath) ||
        isRetry ||
        refreshAccessToken == null) {
      handler.next(err);
      return;
    }

    final newToken = await (_refreshInFlight ??= _runRefresh());
    _refreshInFlight = null;

    if (newToken == null) {
      onSessionExpired?.call();
      handler.next(err);
      return;
    }

    try {
      final retryOptions = err.requestOptions;
      retryOptions.headers['Authorization'] = 'Bearer $newToken';
      retryOptions.extra['retried'] = true;
      final response = await _dio.fetch<dynamic>(retryOptions);
      handler.resolve(response);
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  Future<String?> _runRefresh() async {
    try {
      return await refreshAccessToken?.call();
    } catch (_) {
      return null;
    }
  }
}
