import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuthStore } from '../../lib/stores/authStore';
import { colors, radii, type, button, buttonText, input } from '../../lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signUp } = useAuthStore();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) return Alert.alert('Missing Fields', 'Please enter email and password.');
    if (isSignUp && !username.trim()) return Alert.alert('Missing Username', 'Please enter a username.');
    setIsLoading(true);
    try {
      if (isSignUp) {
        await signUp(email.trim(), password, username.trim());
        Alert.alert('Account Created', 'Welcome to Language Games!', [{ text: 'OK', onPress: () => router.replace('/') }]);
      } else {
        await signIn(email.trim(), password);
        router.replace('/');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Something went wrong.');
    }
    setIsLoading(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ position: 'absolute', top: 16, left: 24 }}>
          <Text style={{ fontSize: 28, color: colors.silver.white }}>‹</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center', marginBottom: 44 }}>
          <Text style={{ fontSize: 40, marginBottom: 14 }}>🎮</Text>
          <Text style={type.hero}>{isSignUp ? 'Create Account' : 'Welcome Back'}</Text>
          <Text style={{ ...type.body, marginTop: 6 }}>
            {isSignUp ? 'Join the language learning competition.' : 'Sign in to continue your journey.'}
          </Text>
        </View>

        <View style={{ gap: 12, marginBottom: 28 }}>
          {isSignUp && (
            <TextInput
              value={username} onChangeText={setUsername}
              placeholder="Username" placeholderTextColor={colors.silver.dark}
              autoCapitalize="none"
              style={input}
            />
          )}
          <TextInput
            value={email} onChangeText={setEmail}
            placeholder="Email" placeholderTextColor={colors.silver.dark}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
            style={input}
          />
          <TextInput
            value={password} onChangeText={setPassword}
            placeholder="Password" placeholderTextColor={colors.silver.dark}
            secureTextEntry
            style={input}
          />
        </View>

        <TouchableOpacity onPress={handleSubmit} disabled={isLoading} style={{ ...button.primary, opacity: isLoading ? 0.6 : 1 }}>
          <Text style={buttonText.primary}>{isLoading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={{ alignItems: 'center', marginTop: 22 }}>
          <Text style={{ fontSize: 14, color: colors.blue.light }}>
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
