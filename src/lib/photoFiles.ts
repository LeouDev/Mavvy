import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

// Photos live in <documents>/photos/. The DB stores the path relative to <documents>
// ('photos/abc.jpg'); resolve it with uriFor() at render time.
const DIR = 'photos';

function photoDir() {
  const d = new Directory(Paths.document, DIR);
  if (!d.exists) d.create({ idempotent: true, intermediates: true });
  return d;
}

const newName = (ext: string) => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

export const uriFor = (rel: string) => new File(Paths.document, rel).uri;

/** Copy a picked/temporary image into permanent storage; returns the relative path. */
export function importImage(uri: string): string {
  const ext = /\.png$/i.test(uri) ? 'png' : 'jpg';
  const name = newName(ext);
  new File(uri).copy(new File(photoDir(), name));
  return `${DIR}/${name}`;
}

/** Save base64 image data (e.g. a beautify result); returns the relative path. */
export function saveBase64(b64: string, mime: string): string {
  const name = newName(mime === 'image/png' ? 'png' : 'jpg');
  const f = new File(photoDir(), name);
  f.create();
  f.write(b64, { encoding: 'base64' });
  return `${DIR}/${name}`;
}

/** Best-effort delete; a missing file is fine. */
export function removeFile(rel: string | null) {
  if (!rel) return;
  try {
    const f = new File(Paths.document, rel);
    if (f.exists) f.delete();
  } catch (err) {
    console.warn('Could not delete photo file', rel, err);
  }
}

/** Let the user take or choose photos. Returns temporary URIs (import them with importImage). */
export async function pickPhotos(source: 'camera' | 'library', multiple = true): Promise<string[]> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access is off', 'Allow camera access for Mavvy in Settings to take photos.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return [];
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    return r.canceled ? [] : r.assets.map((a) => a.uri);
  }
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: multiple, selectionLimit: multiple ? 10 : 1,
  });
  return r.canceled ? [] : r.assets.map((a) => a.uri);
}
