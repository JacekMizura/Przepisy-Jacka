import { colorTokens } from '@moja-kuchnia/design-tokens';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function TabLabel({
  label,
  focused,
}: {
  label: string;
  focused: boolean;
}) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: focused ? '700' : '500',
        color: focused ? colorTokens.accent : colorTokens.muted,
      }}
      maxFontSizeMultiplier={1.3}
    >
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        tabBarActiveTintColor: colorTokens.accent,
        tabBarInactiveTintColor: colorTokens.muted,
        tabBarStyle: {
          minHeight: 56,
          paddingBottom: 6,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Zapasy',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Zapasy" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: 'Zakupy',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Zakupy" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Przepisy',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Przepisy" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Więcej',
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Więcej" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
