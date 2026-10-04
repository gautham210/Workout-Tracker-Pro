import React, { memo, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { exerciseSceneSvg } from '../../shared/exerciseScenes.js';
import { exerciseArt } from '../lib/exerciseArt';

type Props = { name?: string | null; muscle?: string | null; size?: number; width?: number; height?: number; radius?: number };

// The drawn scene is always rendered as the base layer, so an exercise is never
// blank; a bundled photograph fades in over it once it has loaded.
function ExerciseVisual({ name, muscle, size = 56, width, height, radius = 16 }: Props) {
  const art = useMemo(() => exerciseArt({ name: name ?? undefined, muscle_group: muscle ?? undefined }), [name, muscle]);
  const xml = useMemo(() => exerciseSceneSvg(art.scene), [art.scene]);
  const [photoFailed, setPhotoFailed] = useState(false);
  const w = width ?? size; const h = height ?? size;
  return (
    <View style={[styles.box, { width: w, height: h, borderRadius: radius }]} accessible accessibilityRole="image" accessibilityLabel={`${art.identity.canonical_label || name || 'Exercise'} illustration`}>
      <SvgXml xml={xml} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
      {art.photo && !photoFailed ? <Image source={art.photo} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setPhotoFailed(true)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { overflow: 'hidden', backgroundColor: '#e7f2ff' } });
export default memo(ExerciseVisual);
