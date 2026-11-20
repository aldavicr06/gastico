import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DialogHost } from '../components/DialogHost';
import { ToastHost } from '../components/ToastHost';
import { AppProvider, useApp } from '../lib/app-context';
import { useDocumentTitle } from '../lib/document-title';
import { migrate } from '../lib/db';

function ThemedStack() {
  const { colors } = useApp();
  useDocumentTitle();
  return (
    <>
      <StatusBar style={colors.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="scan" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="import" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
      <ToastHost />
      <DialogHost />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="gastico.db" onInit={migrate}>
        <AppProvider>
          <ThemedStack />
        </AppProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
