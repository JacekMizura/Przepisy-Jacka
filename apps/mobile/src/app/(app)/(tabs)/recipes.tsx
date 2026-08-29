import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ui } from '@/theme/ui';

/** Placeholder — pełny moduł przepisów w kolejnym etapie mobile. */
export default function RecipesTab() {
  return (
    <SafeAreaView style={ui.screen} edges={['bottom']}>
      <View style={ui.padded}>
        <Text style={ui.title} accessibilityRole="header">
          Przepisy
        </Text>
        <Text style={ui.subtitle}>
          Moduł przepisów na telefonie pojawi się w kolejnym etapie. Na razie
          przeglądaj i edytuj przepisy w aplikacji webowej Moja Kuchnia.
        </Text>
        <View style={ui.card}>
          <Text style={ui.muted}>
            Plan: lista, szczegóły, dostępność składników i dodawanie braków do
            listy zakupów — bez kopiowania UI weba 1:1.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
