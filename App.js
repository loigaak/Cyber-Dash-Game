import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Dimensions, Alert, PanGestureHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTailwind } from 'tailwind-rn';
import { GameEngine } from 'react-native-game-engine';

const { width, height } = Dimensions.get('window');
const RUNNER_SIZE = 40;
const OBSTACLE_SIZE = 50;
const ORB_SIZE = 20;
const INITIAL_RUNNER = { x: width / 4, y: height - 100, velocity: 0, state: 'running' };
const SPEED = 4;

const App = () => {
  const tailwind = useTailwind();
  const [gameState, setGameState] = useState('menu');
  const [score, setScore] = useState(0);
  const [highScores, setHighScores] = useState([]);
  const [entities, setEntities] = useState({
    runner: { ...INITIAL_RUNNER, renderer: <Runner /> },
    obstacles: [],
    orbs: [],
  });

  // Load high scores
  useEffect(() => {
    const loadHighScores = async () => {
      try {
        const stored = await AsyncStorage.getItem('highScores');
        if (stored) setHighScores(JSON.parse(stored));
      } catch (error) {
        console.error('Error loading high scores:', error);
      }
    };
    loadHighScores();
  }, []);

  // Save high score
  const saveHighScore = async () => {
    try {
      const newScores = [...highScores, { score, date: new Date().toISOString() }]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      await AsyncStorage.setItem('highScores', JSON.stringify(newScores));
      setHighScores(newScores);
    } catch (error) {
      console.error('Error saving high score:', error);
    }
  };

  // Reset high scores
  const resetHighScores = async () => {
    try {
      await AsyncStorage.setItem('highScores', JSON.stringify([]));
      setHighScores([]);
      Alert.alert('Success', 'High scores cleared!');
    } catch (error) {
      console.error('Error resetting high scores:', error);
    }
  };

  // Game systems
  const systems = {
    moveRunner: ({ entities, gestures }) => {
      const runner = entities.runner;
      gestures.forEach(gesture => {
        if (gesture.type === 'pan') {
          const { translationY } = gesture.event;
          if (translationY < -50 && runner.state === 'running') {
            runner.velocity = -12; // Jump
            runner.state = 'jumping';
          } else if (translationY > 50 && runner.state === 'running') {
            runner.state = 'sliding';
            setTimeout(() => { if (runner.state === 'sliding') runner.state = 'running'; }, 500);
          }
        }
      });
      if (runner.state === 'jumping') {
        runner.velocity += 0.6; // Gravity
        runner.y += runner.velocity;
        if (runner.y >= height - 100) {
          runner.y = height - 100;
          runner.velocity = 0;
          runner.state = 'running';
        }
      }
      if (runner.y < 0) {
        setGameState('gameOver');
        saveHighScore();
      }
      return entities;
    },
    spawnObstacles: ({ entities, time }) => {
      if (time.current % 1200 < 50) {
        entities.obstacles.push({
          x: width,
          y: height - 100,
          type: Math.random() > 0.5 ? 'laser' : 'drone',
          renderer: <Obstacle />,
        });
      }
      entities.obstacles = entities.obstacles.map(obstacle => ({
        ...obstacle,
        x: obstacle.x - SPEED,
      })).filter(obstacle => obstacle.x > -OBSTACLE_SIZE);
      return entities;
    },
    spawnOrbs: ({ entities, time }) => {
      if (time.current % 1800 < 50) {
        entities.orbs.push({
          x: width,
          y: Math.random() * (height - 200) + 50,
          renderer: <Orb />,
        });
      }
      entities.orbs = entities.orbs.map(orb => ({
        ...orb,
        x: orb.x - SPEED,
      })).filter(orb => orb.x > -ORB_SIZE);
      return entities;
    },
    checkCollisions: ({ entities }) => {
      const runner = entities.runner;
      entities.obstacles.forEach(obstacle => {
        const isHit = runner.state === 'sliding' && obstacle.type === 'laser' ?
          Math.abs(runner.x - obstacle.x) < RUNNER_SIZE :
          Math.abs(runner.x - obstacle.x) < RUNNER_SIZE && Math.abs(runner.y - obstacle.y) < RUNNER_SIZE;
        if (isHit) {
          setGameState('gameOver');
          saveHighScore();
        }
      });
      entities.orbs = entities.orbs.filter(orb => {
        if (Math.abs(runner.x - orb.x) < RUNNER_SIZE && Math.abs(runner.y - orb.y) < RUNNER_SIZE) {
          setScore(score + 20);
          return false;
        }
        return true;
      });
      setScore(score + 1); // Increment score over time
      return entities;
    },
  };

  // Start game
  const startGame = () => {
    setGameState('playing');
    setScore(0);
    setEntities({
      runner: { ...INITIAL_RUNNER, renderer: <Runner /> },
      obstacles: [],
      orbs: [],
    });
  };

  // Render components
  const Runner = () => {
    const style = useAnimatedStyle(() => ({
      transform: [
        { translateX: withTiming(entities.runner.x, { duration: 50 }) },
        { translateY: withTiming(entities.runner.y, { duration: 50 }) },
      ],
      height: entities.runner.state === 'sliding' ? RUNNER_SIZE / 2 : RUNNER_SIZE,
    }));
    return <Reanimated.View style={[tailwind('w-10 bg-cyan-400 rounded-lg'), style]} />;
  };

  const Obstacle = ({ type }) => {
    const style = useAnimatedStyle(() => ({
      transform: [
        { translateX: withTiming(entities.obstacles[0]?.x || 0, { duration: 50 }) },
        { translateY: withTiming(entities.obstacles[0]?.y || 0, { duration: 50 }) },
      ],
    }));
    return <Reanimated.View style={[tailwind(`w-12 h-12 ${type === 'laser' ? 'bg-red-500' : 'bg-purple-500'} rounded-md`), style]} />;
  };

  const Orb = () => {
    const style = useAnimatedStyle(() => ({
      transform: [
        { translateX: withTiming(entities.orbs[0]?.x || 0, { duration: 50 }) },
        { translateY: withTiming(entities.orbs[0]?.y || 0, { duration: 50 }) },
      ],
    }));
    return <Reanimated.View style={[tailwind('w-5 h-5 bg-yellow-400 rounded-full'), style]} />;
  };

  // Handle gestures
  const onGestureEvent = event => {
    systems.moveRunner({ entities, gestures: [{ type: 'pan', event: event.nativeEvent }] });
  };

  // Render screens
  const renderMenu = () => (
    <View style={tailwind('flex-1 justify-center items-center bg-gray-900')}>
      <Text style={tailwind('text-4xl text-cyan-400 mb-8')}>Cyber Dash</Text>
      <TouchableOpacity style={tailwind('bg-cyan-500 p-4 rounded-lg mb-4')} onPress={startGame}>
        <Text style={tailwind('text-white text-lg')}>Start Game</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={tailwind('bg-gray-500 p-4 rounded-lg mb-4')}
        onPress={() => setGameState('highScores')}
      >
        <Text style={tailwind('text-white text-lg')}>High Scores</Text>
      </TouchableOpacity>
      <TouchableOpacity style={tailwind('bg-red-500 p-4 rounded-lg')} onPress={resetHighScores}>
        <Text style={tailwind('text-white text-lg')}>Reset Scores</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGame = () => (
    <PanGestureHandler onGestureEvent={onGestureEvent}>
      <View style={tailwind('flex-1 bg-gray-900')}>
        <GameEngine
          style={tailwind('flex-1')}
          systems={[systems.moveRunner, systems.spawnObstacles, systems.spawnOrbs, systems.checkCollisions]}
          entities={entities}
          running={gameState === 'playing'}
        />
        <Text style={tailwind('text-cyan-400 text-2xl absolute top-4 left-4')}>Score: {score}</Text>
      </View>
    </PanGestureHandler>
  );

  const renderHighScores = () => (
    <View style={tailwind('flex-1 justify-center items-center bg-gray-900')}>
      <Text style={tailwind('text-3xl text-cyan-400 mb-4')}>High Scores</Text>
      {highScores.length ? (
        highScores.map((entry, index) => (
          <Text key={index} style={tailwind('text-lg text-white')}>
            {index + 1}. {entry.score} points ({entry.date})
          </Text>
        ))
      ) : (
        <Text style={tailwind('text-lg text-white')}>No high scores yet.</Text>
      )}
      <TouchableOpacity
        style={tailwind('bg-cyan-500 p-4 rounded-lg mt-4')}
        onPress={() => setGameState('menu')}
      >
        <Text style={tailwind('text-white text-lg')}>Back to Menu</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGameOver = () => (
    <View style={tailwind('flex-1 justify-center items-center bg-gray-900')}>
      <Text style={tailwind('text-3xl text-cyan-400 mb-4')}>Game Over!</Text>
      <Text style={tailwind('text-2xl text-white mb-8')}>Score: {score}</Text>
      <TouchableOpacity style={tailwind('bg-cyan-500 p-4 rounded-lg mb-4')} onPress={startGame}>
        <Text style={tailwind('text-white text-lg')}>Play Again</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={tailwind('bg-gray-500 p-4 rounded-lg')}
        onPress={() => setGameState('menu')}
      >
        <Text style={tailwind('text-white text-lg')}>Main Menu</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={tailwind('flex-1')}>
      {gameState === 'menu' && renderMenu()}
      {gameState === 'playing' && renderGame()}
      {gameState === 'highScores' && renderHighScores()}
      {gameState === 'gameOver' && renderGameOver()}
    </View>
  );
};

export default App;
