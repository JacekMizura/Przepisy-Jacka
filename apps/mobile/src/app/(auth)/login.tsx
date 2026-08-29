import { Link } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { useAuthKitchen } from '@/providers/auth-kitchen';
import { ui } from '@/theme/ui';

export default function LoginScreen() {
  const { refreshSession } = useAuthKitchen();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      const { error: signError } = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(signError.message || 'Nie udało się zalogować.');
        return;
      }
      await refreshSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zalogować.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={ui.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={ui.padded}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={ui.title} accessibilityRole="header">
            Moja Kuchnia
          </Text>
          <Text style={ui.subtitle}>
            Zaloguj się, żeby zobaczyć zapasy i listę zakupów na telefonie.
          </Text>
          <View style={ui.card}>
            <Text style={ui.label}>E-mail</Text>
            <TextInput
              style={ui.input}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              accessibilityLabel="E-mail"
            />
            <Text style={ui.label}>Hasło</Text>
            <TextInput
              style={ui.input}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              accessibilityLabel="Hasło"
            />
            {error ? (
              <Text style={ui.dangerText} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <PrimaryButton
              label="Zaloguj"
              loading={loading}
              onPress={() => void onSubmit()}
            />
            <Link href="/(auth)/register" asChild>
              <PrimaryButton label="Utwórz konto" secondary />
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
