/* eslint-disable import/first -- jest mocks before imports */
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  getMediaLibraryPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body?: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
  createMobileApiClient: jest.fn(),
  getApiBaseUrl: () => 'http://localhost:3001',
  requireApiData: (
    result: { data?: unknown; error?: unknown; response: { status: number } },
    fallback: string,
  ) => {
    if (result.error !== undefined || result.data === undefined) {
      throw new Error(fallback);
    }
    return result.data;
  },
  apiStatus: (result: { response: { status: number } }) => result.response.status,
  readApiError: (_e: unknown, fallback: string) => fallback,
}));

import * as ImagePicker from 'expo-image-picker';
import { createMobileApiClient } from '@/lib/api';
import { pickImage, uploadKitchenMedia } from '@/lib/media';
/* eslint-enable import/first */
describe('media pick and upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns denied when camera permission missing', async () => {
    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    const result = await pickImage('camera');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('denied');
    }
  });

  it('returns cancelled when user dismisses picker', async () => {
    (
      ImagePicker.getMediaLibraryPermissionsAsync as jest.Mock
    ).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: true,
      assets: [],
    });
    const result = await pickImage('library');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('cancelled');
    }
  });

  it('uploads begin → put → complete and cleans up on put failure', async () => {
    const post = jest.fn().mockResolvedValueOnce({
      data: {
        mediaAssetId: 'media-1',
        uploadUrl: 'https://r2.example/upload',
        headers: { 'Content-Type': 'image/jpeg' },
      },
      error: undefined,
      response: { status: 201 },
    });
    const del = jest.fn().mockResolvedValue({ error: undefined });
    (createMobileApiClient as jest.Mock).mockReturnValue({
      POST: post,
      DELETE: del,
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['abc'], { type: 'image/jpeg' }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(
      uploadKitchenMedia({
        kitchenId: 'k1',
        image: {
          uri: 'file://photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
          byteLength: 3,
        },
        purpose: 'purchase_receipt',
      }),
    ).rejects.toThrow(/magazynu/i);

    expect(del).toHaveBeenCalled();
  });

  it('completes successful s3 upload', async () => {
    const post = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          mediaAssetId: 'media-2',
          uploadUrl: 'https://r2.example/upload',
          headers: { 'Content-Type': 'image/jpeg' },
        },
        error: undefined,
        response: { status: 201 },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'media-2',
          status: 'ready',
          kitchenId: 'k1',
          purpose: 'product',
          mimeType: 'image/jpeg',
          byteSize: 3,
          width: null,
          height: null,
          image: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        error: undefined,
        response: { status: 200 },
      });
    (createMobileApiClient as jest.Mock).mockReturnValue({
      POST: post,
      DELETE: jest.fn(),
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['abc'], { type: 'image/jpeg' }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const asset = await uploadKitchenMedia({
      kitchenId: 'k1',
      image: {
        uri: 'file://photo.jpg',
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
        byteLength: 3,
      },
      purpose: 'product',
    });
    expect(asset.id).toBe('media-2');
    expect(asset.status).toBe('ready');
  });
});
