import 'package:dio/dio.dart';

/// Direct HTTP client for `/v1/notifications/device-tokens*`
/// (`apps/api/src/modules/device-tokens/device-tokens.controller.ts`, E21
/// T4) — the same plain `AuthGuard('jwt')` shape every other feature's
/// API class already targets.
class DeviceTokenApi {
  DeviceTokenApi(this._dio);

  final Dio _dio;

  Future<void> register({required String platform, required String token}) {
    return _dio.post<void>(
      '/notifications/device-tokens',
      data: {'platform': platform, 'token': token},
    );
  }

  Future<void> unregister(String token) {
    return _dio.delete<void>('/notifications/device-tokens/$token');
  }
}
