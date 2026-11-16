import { router } from 'expo-router';

/** Close a modal screen; falls back to Home when it was opened directly (web URL or reload). */
export function closeModal() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
