import { View, Text, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../lib/stores/authStore';
import { LANGUAGES } from '../../lib/types';
import { colors, radii, type } from '../../lib/theme';

function SettingRow({ label, value, onPress, rightElement }: {
  label: string; value?: string; onPress?: () => void; rightElement?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress && !rightElement}
      activeOpacity={onPress ? 0.6 : 1}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.divider,
      }}
    >
      <Text style={{ fontSize: 15, color: colors.silver.white }}>{label}</Text>
      {rightElement || (
        <Text style={{ fontSize: 14, color: colors.silver.light }}>{value || '›'}</Text>
      )}
    </TouchableOpacity>
  );
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={{ ...type.label, marginBottom: 8, paddingHorizontal: 16 }}>
        {title}
      </Text>
      <View
        style={{
          backgroundColor: colors.bg.secondary,
          borderRadius: radii.lg,
          overflow: 'hidden',
          borderWidth: 0.5,
          borderColor: colors.glassBorder,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, isAuthenticated, signOut, updateProfile } = useAuthStore();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleChangeLanguage = (langType: 'native' | 'learning') => {
    const langKeys = Object.keys(LANGUAGES);
    const options = langKeys.slice(0, 8).map((key) => ({
      text: LANGUAGES[key],
      onPress: () => {
        if (langType === 'native') updateProfile({ native_language: key });
        else updateProfile({ learning_language: key });
      },
    }));
    Alert.alert(
      langType === 'native' ? 'Native Language' : 'Learning Language',
      'Select a language',
      [...options, { text: 'Cancel', style: 'cancel' as const }]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ ...type.hero, paddingHorizontal: 20, marginBottom: 28 }}>
          Settings
        </Text>

        <View style={{ paddingHorizontal: 20 }}>
          {/* Account */}
          <SettingSection title="Account">
            {isAuthenticated ? (
              <>
                <SettingRow label="Username" value={user?.username} />
                <SettingRow label="Email" value="Manage in Supabase" />
                <SettingRow
                  label="Sign Out"
                  onPress={handleSignOut}
                  rightElement={<Text style={{ fontSize: 14, color: colors.error }}>Sign Out</Text>}
                />
              </>
            ) : (
              <SettingRow
                label="Sign In"
                onPress={() => router.push('/auth/login')}
                rightElement={<Text style={{ fontSize: 14, color: colors.blue.light }}>Sign In ›</Text>}
              />
            )}
          </SettingSection>

          {/* Language */}
          <SettingSection title="Language">
            <SettingRow
              label="I speak"
              value={LANGUAGES[user?.native_language || 'en']}
              onPress={() => handleChangeLanguage('native')}
            />
            <SettingRow
              label="I'm learning"
              value={LANGUAGES[user?.learning_language || 'es']}
              onPress={() => handleChangeLanguage('learning')}
            />
          </SettingSection>

          {/* Preferences */}
          <SettingSection title="Preferences">
            <SettingRow
              label="Sound Effects"
              rightElement={
                <Switch
                  value={soundEnabled}
                  onValueChange={setSoundEnabled}
                  trackColor={{ false: colors.silver.dark, true: colors.blue.bright }}
                  thumbColor="#FFFFFF"
                />
              }
            />
            <SettingRow
              label="Haptics"
              rightElement={
                <Switch
                  value={hapticsEnabled}
                  onValueChange={setHapticsEnabled}
                  trackColor={{ false: colors.silver.dark, true: colors.blue.bright }}
                  thumbColor="#FFFFFF"
                />
              }
            />
            <SettingRow
              label="Notifications"
              rightElement={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={{ false: colors.silver.dark, true: colors.blue.bright }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </SettingSection>

          {/* About */}
          <SettingSection title="About">
            <SettingRow label="Version" value="1.0.0" />
            <SettingRow label="Terms of Service" onPress={() => {}} />
            <SettingRow label="Privacy Policy" onPress={() => {}} />
          </SettingSection>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
