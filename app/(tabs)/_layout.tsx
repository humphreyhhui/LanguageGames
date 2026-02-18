import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { colors } from '../../lib/theme';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '🎮',
    Profile: '👤',
    Settings: '⚙️',
  };

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4 }}>
      <Text style={{ fontSize: 22 }}>{icons[name] || '•'}</Text>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 10,
          fontWeight: focused ? '600' : '400',
          color: focused ? colors.blue.light : colors.silver.mid,
          marginTop: 2,
        }}
      >
        {name}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg.primary,
          borderTopColor: colors.glassBorder,
          borderTopWidth: 0.5,
          height: 80,
          paddingBottom: 20,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.blue.light,
        tabBarInactiveTintColor: colors.silver.mid,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="Profile" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="Settings" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
