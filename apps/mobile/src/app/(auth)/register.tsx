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

export default function RegisterScreen() {
  const { refreshSession } = useAuthKitchen();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      const { error: signError } = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(signError.message || 'Nie udało się zarejestrować.');
        return;
      }
      await refreshSession();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Nie udało się zarejestrować.',
      );
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
          <Text style={ui.title}>Nowe konto</Text>
          <Text style={ui.subtitle}>
            To samo konto co w aplikacji webowej Moja Kuchnia.
          </Text>
          <View style={ui.card}>
            <Text style={ui.label}>Imię</Text>
            <TextInput
              style={ui.input}
              value={name}
              onChangeText={setName}
              accessibilityLabel="Imię"
            />
            <Text style={ui.label}>E-mail</Text>
            <TextInput
              style={ui.input}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              accessibilityLabel="E-mail"
            />
            <Text style={ui.label}>Hasło (min. 8 znaków)</Text>
            <TextInput
              style={ui.input}
              secureTextEntry
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
              label="Zarejestruj"
              loading={loading}
              onPress={() => void onSubmit()}
            />
            <Link href="/(auth)/login" asChild>
              <PrimaryButton label="Mam już konto" secondary />
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
