import { View, Text, TouchableOpacity } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { colors, radii, type, button, buttonText } from '../lib/theme';
import { pickRandomAd } from '../lib/adHelpers';

const COUNTDOWN_SECONDS = 5;

interface AdBannerProps {
  userId: string;
  gameType: string;
  gameSessionId?: string;
  onDismiss: () => void;
}

export default function AdBanner({ userId, gameType, gameSessionId, onDismiss }: AdBannerProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [canDismiss, setCanDismiss] = useState(false);
  const impressionIdRef = useRef<string | null>(null);
  const shownAtRef = useRef<number>(Date.now());
  const adRef = useRef(pickRandomAd());

  useEffect(() => {
    const ad = adRef.current;
    (async () => {
      const { data, error } = await supabase
        .from('ad_impressions')
        .insert({
          ad_id: ad.id,
          user_id: userId,
          game_type: gameType,
          game_session_id: gameSessionId || null,
        })
        .select('id')
        .single();
      if (!error && data) impressionIdRef.current = data.id;
    })();
  }, [userId, gameType, gameSessionId]);

  useEffect(() => {
    if (countdown <= 0) {
      setCanDismiss(true);
      return;
    }
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleDismiss = async () => {
    const id = impressionIdRef.current;
    const durationMs = Math.round(Date.now() - shownAtRef.current);
    if (id) {
      await supabase
        .from('ad_impressions')
        .update({ dismissed_at: new Date().toISOString(), duration_viewed_ms: durationMs })
        .eq('id', id);
    }
    onDismiss();
  };

  const ad = adRef.current;

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <View
        style={{
          width: '100%',
          aspectRatio: 2.5,
          backgroundColor: ad.color,
          borderRadius: radii.lg,
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: 2,
          borderColor: colors.glassBorder,
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff' }}>{ad.label}</Text>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 8 }}>Sponsored</Text>
      </View>

      <View style={{ marginTop: 24, alignItems: 'center' }}>
        {canDismiss ? (
          <TouchableOpacity onPress={handleDismiss} style={{ ...button.primary, paddingHorizontal: 48 }}>
            <Text style={buttonText.primary}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ ...type.body, color: colors.silver.mid }}>
            Continue in {countdown}s
          </Text>
        )}
      </View>
    </View>
  );
}
