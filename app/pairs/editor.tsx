import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../lib/stores/authStore';
import { SERVER_URL } from '../../lib/constants';
import { LANGUAGES, TranslationPair, CustomPairSet } from '../../lib/types';
import { colors, radii, type, card, button, buttonText, input } from '../../lib/theme';

export default function PairEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuthStore();

  const [name, setName] = useState('');
  const [languageFrom, setLanguageFrom] = useState('en');
  const [languageTo, setLanguageTo] = useState('es');
  const [isPublic, setIsPublic] = useState(false);
  const [pairs, setPairs] = useState<{ source: string; target: string }[]>([{ source: '', target: '' }, { source: '', target: '' }, { source: '', target: '' }]);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => { if (params.id) loadPairSet(params.id); }, [params.id]);

  const loadPairSet = async (id: string) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/pairs/my-sets`, {
        headers: { Authorization: `Bearer ${(await (await import('../../lib/supabase')).supabase.auth.getSession()).data.session?.access_token}` },
      });
      const data = await response.json();
      const pairSet = data.pairSets?.find((ps: CustomPairSet) => ps.id === id);
      if (pairSet) { setName(pairSet.name); setLanguageFrom(pairSet.language_from); setLanguageTo(pairSet.language_to); setIsPublic(pairSet.is_public); setPairs(pairSet.pairs.length > 0 ? pairSet.pairs : [{ source: '', target: '' }]); setIsEditing(true); }
    } catch (error) { console.error('Failed to load pair set:', error); }
  };

  const addPair = () => setPairs([...pairs, { source: '', target: '' }]);
  const removePair = (index: number) => { if (pairs.length <= 1) return; setPairs(pairs.filter((_, i) => i !== index)); };
  const updatePair = (index: number, field: 'source' | 'target', value: string) => { const updated = [...pairs]; updated[index] = { ...updated[index], [field]: value }; setPairs(updated); };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Name Required', 'Please give your study set a name.');
    const validPairs = pairs.filter((p) => p.source.trim() && p.target.trim());
    if (validPairs.length < 2) return Alert.alert('More Pairs Needed', 'Add at least 2 complete pairs.');
    setIsSaving(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const url = isEditing ? `${SERVER_URL}/api/pairs/${params.id}` : `${SERVER_URL}/api/pairs`;
      const response = await fetch(url, { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: name.trim(), languageFrom, languageTo, isPublic, pairs: validPairs }) });
      if (response.ok) Alert.alert('Saved!', 'Your study set has been saved.', [{ text: 'OK', onPress: () => router.back() }]);
      else Alert.alert('Error', 'Failed to save. Make sure you are signed in.');
    } catch { Alert.alert('Error', 'Could not connect to server.'); }
    setIsSaving(false);
  };

  const handleAutoGenerate = async () => {
    if (!name.trim()) return Alert.alert('Name First', 'Enter a set name or topic first (e.g. "Kitchen Vocabulary")');
    Alert.alert('Auto-Generate', `Generate 10 pairs for "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Generate', onPress: async () => {
        try {
          const response = await fetch(`${SERVER_URL}/api/games/pairs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromLang: languageFrom, toLang: languageTo, count: 10, difficulty: 'medium' }) });
          const data = await response.json();
          if (data.pairs?.length > 0) setPairs(data.pairs.map((p: TranslationPair) => ({ source: p.source, target: p.target })));
        } catch { Alert.alert('Error', 'Could not generate pairs. Is the server running?'); }
      }},
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ fontSize: 28, color: colors.silver.white }}>‹</Text>
          </TouchableOpacity>
          <Text style={type.headline}>{isEditing ? 'Edit Study Set' : 'New Study Set'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={isSaving}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: isSaving ? colors.silver.mid : colors.blue.light }}>{isSaving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Set Name */}
          <TextInput value={name} onChangeText={setName} placeholder="Set name (e.g. Kitchen Vocabulary)" placeholderTextColor={colors.silver.dark} style={{ ...input, fontSize: 18, fontWeight: '600', marginBottom: 16 }} />

          {/* Language Selector */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...type.footnote, marginBottom: 4 }}>From</Text>
              <TouchableOpacity style={{ ...input, paddingVertical: 12 }} onPress={() => {
                const options = Object.entries(LANGUAGES).slice(0, 8).map(([key, label]) => ({ text: label, onPress: () => setLanguageFrom(key) }));
                Alert.alert('From Language', '', [...options, { text: 'Cancel', style: 'cancel' as const }]);
              }}>
                <Text style={{ fontSize: 15, color: colors.silver.white }}>{LANGUAGES[languageFrom]}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ justifyContent: 'flex-end', paddingBottom: 12 }}><Text style={{ fontSize: 20, color: colors.silver.dark }}>→</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...type.footnote, marginBottom: 4 }}>To</Text>
              <TouchableOpacity style={{ ...input, paddingVertical: 12 }} onPress={() => {
                const options = Object.entries(LANGUAGES).slice(0, 8).map(([key, label]) => ({ text: label, onPress: () => setLanguageTo(key) }));
                Alert.alert('To Language', '', [...options, { text: 'Cancel', style: 'cancel' as const }]);
              }}>
                <Text style={{ fontSize: 15, color: colors.silver.white }}>{LANGUAGES[languageTo]}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Public toggle */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <View>
              <Text style={type.headline}>Make Public</Text>
              <Text style={type.footnote}>Others can use your set</Text>
            </View>
            <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ false: colors.silver.dark, true: colors.blue.bright }} thumbColor="#FFFFFF" />
          </View>

          {/* AI Generate */}
          <TouchableOpacity onPress={handleAutoGenerate} style={{ ...card, backgroundColor: colors.blue.dark, borderColor: colors.blue.bright + '25', paddingVertical: 14, alignItems: 'center', marginBottom: 24 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.blue.pale }}>✨ Auto-Generate with AI</Text>
          </TouchableOpacity>

          {/* Pairs List */}
          <Text style={{ ...type.headline, marginBottom: 12 }}>Pairs ({pairs.filter((p) => p.source && p.target).length})</Text>

          {pairs.map((pair, index) => (
            <View key={index} style={{ backgroundColor: colors.bg.secondary, borderRadius: radii.md, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: colors.glassBorder }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={type.footnote}>Pair {index + 1}</Text>
                {pairs.length > 1 && <TouchableOpacity onPress={() => removePair(index)}><Text style={{ fontSize: 12, color: colors.error }}>Remove</Text></TouchableOpacity>}
              </View>
              <TextInput value={pair.source} onChangeText={(val) => updatePair(index, 'source', val)} placeholder={`Word in ${LANGUAGES[languageFrom]}`} placeholderTextColor={colors.silver.dark} style={{ ...input, paddingVertical: 10, marginBottom: 6 }} />
              <TextInput value={pair.target} onChangeText={(val) => updatePair(index, 'target', val)} placeholder={`Translation in ${LANGUAGES[languageTo]}`} placeholderTextColor={colors.silver.dark} style={{ ...input, paddingVertical: 10 }} />
            </View>
          ))}

          <TouchableOpacity onPress={addPair} style={{ borderWidth: 1, borderColor: colors.silver.dark, borderStyle: 'dashed', borderRadius: radii.md, paddingVertical: 16, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: 14, color: colors.blue.light }}>+ Add Pair</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
