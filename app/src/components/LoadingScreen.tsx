import React from 'react';
import {ActivityIndicator, Image, StyleSheet, Text, View} from 'react-native';

type LoadingScreenProps = {
  message: string;
};

export default function LoadingScreen({message}: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image source={require('../../assets/parking-logo.png')} style={styles.logo} />
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef4ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 112,
    height: 112,
    marginBottom: 28,
  },
  message: {
    marginTop: 12,
    color: '#475467',
    fontSize: 16,
    fontWeight: '600',
  },
});
