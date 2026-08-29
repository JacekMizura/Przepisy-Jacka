import type { components } from '@moja-kuchnia/api-client';
import * as ImagePicker from 'expo-image-picker';

import {
  ApiRequestError,
  createMobileApiClient,
  getApiBaseUrl,
  requireApiData,
} from './api';
import type { MediaAsset, MediaPurpose } from './format';

type MediaMime =
  components['schemas']['BeginMediaUploadDto']['declaredMimeType'];
type MediaUploadTarget = components['schemas']['MediaUploadTargetDto'];

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED: MediaMime[] = ['image/jpeg', 'image/png', 'image/webp'];

export type PickedImage = {
  uri: string;
  mimeType: MediaMime;
  fileName: string;
  byteLength: number;
};

export type PickResult =
  | { ok: true; image: PickedImage }
  | { ok: false; reason: 'denied' | 'cancelled' | 'invalid'; message: string };

async function ensurePermission(
  source: 'camera' | 'library',
): Promise<boolean> {
  if (source === 'camera') {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) {
      return true;
    }
    const asked = await ImagePicker.requestCameraPermissionsAsync();
    return asked.granted;
  }
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) {
    return true;
  }
  const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return asked.granted;
}

function normalizeMime(raw: string | undefined | null): MediaMime | null {
  if (!raw) {
    return null;
  }
  const lower = raw.toLowerCase() as MediaMime;
  return ALLOWED.includes(lower) ? lower : null;
}

async function fromAsset(
  asset: ImagePicker.ImagePickerAsset,
): Promise<PickResult> {
  const mimeType =
    normalizeMime(asset.mimeType) ??
    (asset.uri.toLowerCase().endsWith('.png')
      ? 'image/png'
      : asset.uri.toLowerCase().endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg');
  if (!ALLOWED.includes(mimeType)) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Wybierz zdjęcie JPEG, PNG albo WebP.',
    };
  }
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  if (blob.size === 0) {
    return { ok: false, reason: 'invalid', message: 'Wybrany plik jest pusty.' };
  }
  if (blob.size > MAX_BYTES) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Zdjęcie może mieć maksymalnie 10 MB.',
    };
  }
  return {
    ok: true,
    image: {
      uri: asset.uri,
      mimeType,
      fileName: asset.fileName ?? `photo-${Date.now()}.jpg`,
      byteLength: blob.size,
    },
  };
}

export async function pickImage(
  source: 'camera' | 'library',
): Promise<PickResult> {
  const granted = await ensurePermission(source);
  if (!granted) {
    return {
      ok: false,
      reason: 'denied',
      message:
        source === 'camera'
          ? 'Brak dostępu do aparatu. Włącz uprawnienie w ustawieniach telefonu.'
          : 'Brak dostępu do galerii. Włącz uprawnienie w ustawieniach telefonu.',
    };
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.85,
          allowsEditing: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.85,
          allowsEditing: true,
        });
  if (result.canceled || !result.assets[0]) {
    return {
      ok: false,
      reason: 'cancelled',
      message: 'Anulowano wybór zdjęcia.',
    };
  }
  return fromAsset(result.assets[0]);
}

function isMemoryUploadUrl(uploadUrl: string): boolean {
  return uploadUrl.startsWith('/api/') && uploadUrl.endsWith('/memory-upload');
}

async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Nie udało się odczytać pliku.'));
        return;
      }
      const separator = result.indexOf(',');
      resolve(separator >= 0 ? result.slice(separator + 1) : result);
    };
    reader.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));
    reader.readAsDataURL(blob);
  });
}

export async function uploadKitchenMedia(options: {
  kitchenId: string;
  image: PickedImage;
  purpose: MediaPurpose;
  target?: MediaUploadTarget;
  onProgress?: (percent: number) => void;
}): Promise<MediaAsset> {
  const client = createMobileApiClient();
  options.onProgress?.(5);
  const begin = await client.POST('/api/kitchens/{kitchenId}/media/uploads', {
    params: { path: { kitchenId: options.kitchenId } },
    body: {
      purpose: options.purpose,
      declaredMimeType: options.image.mimeType,
      declaredByteSize: options.image.byteLength,
      ...(options.target ? { target: options.target } : {}),
    },
  });
  const beginData = requireApiData(
    begin,
    'Nie udało się rozpocząć wysyłki zdjęcia.',
  );

  const { mediaAssetId, uploadUrl, headers } = beginData;
  try {
    options.onProgress?.(15);
    if (isMemoryUploadUrl(uploadUrl)) {
      const contentBase64 = await uriToBase64(options.image.uri);
      options.onProgress?.(60);
      const memory = await client.POST(
        '/api/kitchens/{kitchenId}/media/{mediaAssetId}/memory-upload',
        {
          params: {
            path: { kitchenId: options.kitchenId, mediaAssetId },
          },
          body: { contentBase64 },
        },
      );
      requireApiData(memory, 'Nie udało się wysłać zdjęcia.');
    } else {
      const absoluteUrl = uploadUrl.startsWith('http')
        ? uploadUrl
        : `${getApiBaseUrl()}${uploadUrl}`;
      const fileResponse = await fetch(options.image.uri);
      const blob = await fileResponse.blob();
      const put = await fetch(absoluteUrl, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type':
            headers['Content-Type'] ?? options.image.mimeType,
        },
        body: blob,
      });
      if (!put.ok) {
        throw new ApiRequestError(
          put.status,
          'Nie udało się wysłać zdjęcia do magazynu.',
        );
      }
    }
    options.onProgress?.(85);
    const complete = await client.POST(
      '/api/kitchens/{kitchenId}/media/{mediaAssetId}/complete',
      {
        params: {
          path: { kitchenId: options.kitchenId, mediaAssetId },
        },
      },
    );
    const completeData = requireApiData(
      complete,
      'Nie udało się zakończyć wysyłki zdjęcia.',
    );
    if (completeData.status !== 'ready') {
      throw new ApiRequestError(
        500,
        'Zdjęcie nie zostało przetworzone. Spróbuj ponownie.',
      );
    }
    options.onProgress?.(100);
    return completeData;
  } catch (error) {
    await client
      .DELETE('/api/kitchens/{kitchenId}/media/{mediaAssetId}', {
        params: {
          path: { kitchenId: options.kitchenId, mediaAssetId },
        },
      })
      .catch(() => undefined);
    throw error;
  }
}

export async function deleteKitchenMedia(
  kitchenId: string,
  mediaAssetId: string,
): Promise<void> {
  const client = createMobileApiClient();
  await client.DELETE('/api/kitchens/{kitchenId}/media/{mediaAssetId}', {
    params: { path: { kitchenId, mediaAssetId } },
  });
}
