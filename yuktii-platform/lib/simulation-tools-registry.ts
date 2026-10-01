/**
 * lib/simulation-tools-registry.ts — Curated registry of free/open-source
 * simulation tools for IoT and Robotics domains.
 *
 * Every entry is verified to be:
 *   - Free for educational use
 *   - Publicly accessible (URL reachable)
 *   - Compatible with the Yuktii evaluation pipeline
 *
 * Used by:
 *   1. The project spec generator to recommend appropriate tools per path
 *   2. The evaluation worker to verify submitted tool configurations
 *   3. The admin portal for implementation path display
 */

export type SimulationDomain = 'iot' | 'robotics' | 'both';
export type LicenseType = 'Apache-2.0' | 'MIT' | 'GPL-2.0' | 'GPL-3.0' | 'zlib' | 'BSD-2-Clause' | 'BSD-3-Clause' | 'EPL-2.0' | 'free-for-edu' | 'free-to-use';

export interface SimulationTool {
  id: string;               // stable slug
  name: string;
  domain: SimulationDomain;
  license: LicenseType;
  url: string;              // verified homepage / quickstart URL
  docsUrl: string;
  description: string;      // 1-line description
  useCases: string[];       // concrete task descriptions
  hardwareRequired: boolean; // true if GPU/physical HW required
  gpuRequired: boolean;
  beginnerFriendly: boolean;
  installCommand?: string;  // quick-start install command
  verifiedAt: string;       // YYYY-MM-DD last URL verification
}

export const SIMULATION_TOOLS: SimulationTool[] = [
  // ── Robotics ────────────────────────────────────────────────────────────────
  {
    id: 'ros2-gazebo',
    name: 'ROS 2 + Gazebo Sim',
    domain: 'robotics',
    license: 'Apache-2.0',
    url: 'https://gazebosim.org/',
    docsUrl: 'https://gazebosim.org/docs',
    description: 'Industry-standard robotics middleware (ROS 2) with the Gazebo physics simulator.',
    useCases: [
      'Mobile robot navigation with LiDAR',
      'Arm manipulation simulations',
      'Multi-robot coordination',
      'Sensor fusion (camera, IMU, ultrasonic)',
    ],
    hardwareRequired: false,
    gpuRequired: false,
    beginnerFriendly: false,
    installCommand: 'sudo apt install ros-humble-desktop gazebo',
    verifiedAt: '2026-09-15',
  },
  {
    id: 'webots',
    name: 'Webots',
    domain: 'robotics',
    license: 'Apache-2.0',
    url: 'https://cyberbotics.com/',
    docsUrl: 'https://cyberbotics.com/doc/guide/index',
    description: 'Open-source robot simulator with built-in physics, sensors, and programming APIs.',
    useCases: [
      'Line-following robots',
      'Obstacle avoidance',
      'Swarm robotics',
      'Visual servo control',
    ],
    hardwareRequired: false,
    gpuRequired: false,
    beginnerFriendly: true,
    installCommand: 'Download from https://cyberbotics.com/#download',
    verifiedAt: '2026-09-15',
  },
  {
    id: 'pybullet',
    name: 'PyBullet',
    domain: 'robotics',
    license: 'zlib',
    url: 'https://pybullet.org/',
    docsUrl: 'https://docs.google.com/document/d/10sXEhzFRSnvFcl3XxNGhnD4N2SedqwdAvK3dsihxVUA',
    description: 'Python-first physics simulation library for manipulation and locomotion tasks.',
    useCases: [
      'Reinforcement learning robotics',
      'Gripper manipulation tasks',
      'Legged robot locomotion',
      'Contact-rich physics simulation',
    ],
    hardwareRequired: false,
    gpuRequired: false,
    beginnerFriendly: true,
    installCommand: 'pip install pybullet',
    verifiedAt: '2026-09-15',
  },
  {
    id: 'mujoco',
    name: 'MuJoCo',
    domain: 'robotics',
    license: 'Apache-2.0',
    url: 'https://mujoco.org/',
    docsUrl: 'https://mujoco.readthedocs.io/en/stable/',
    description: 'High-fidelity physics engine for research-grade robotics and control tasks.',
    useCases: [
      'Dexterous manipulation',
      'Humanoid locomotion',
      'Model predictive control',
      'Contact dynamics research',
    ],
    hardwareRequired: false,
    gpuRequired: false,
    beginnerFriendly: false,
    installCommand: 'pip install mujoco',
    verifiedAt: '2026-09-15',
  },
  {
    id: 'turtlesim',
    name: 'ROS 2 Turtlesim',
    domain: 'robotics',
    license: 'BSD-3-Clause',
    url: 'https://docs.ros.org/en/humble/Tutorials/Beginner-CLI-Tools/Introducing-Turtlesim/Introducing-Turtlesim.html',
    docsUrl: 'https://docs.ros.org/en/humble/Tutorials/Beginner-CLI-Tools.html',
    description: 'Introductory 2D robot simulator bundled with ROS 2 — ideal for first-time ROS learners.',
    useCases: [
      'ROS 2 node communication basics',
      'Topic publish/subscribe patterns',
      'Service and action server patterns',
    ],
    hardwareRequired: false,
    gpuRequired: false,
    beginnerFriendly: true,
    installCommand: 'sudo apt install ros-humble-turtlesim',
    verifiedAt: '2026-09-15',
  },

  // ── IoT ─────────────────────────────────────────────────────────────────────
  {
    id: 'wokwi',
    name: 'Wokwi',
    domain: 'iot',
    license: 'free-to-use',
    url: 'https://wokwi.com/',
    docsUrl: 'https://docs.wokwi.com/',
    description: 'Browser-based Arduino/ESP32 simulator — no install required, shareable via URL.',
    useCases: [
      'Arduino sensor simulations',
      'ESP32 Wi-Fi IoT projects',
      'LCD display and LED matrix projects',
      'Temperature, humidity, and motion sensor demos',
    ],
    hardwareRequired: false,
    gpuRequired: false,
    beginnerFriendly: true,
    verifiedAt: '2026-09-15',
  },
  {
    id: 'platformio',
    name: 'PlatformIO',
    domain: 'iot',
    license: 'Apache-2.0',
    url: 'https://platformio.org/',
    docsUrl: 'https://docs.platformio.org/',
    description: 'Cross-platform embedded development environment supporting 1000+ boards.',
    useCases: [
      'Firmware development for Arduino, ESP32, STM32',
      'Unit testing embedded code',
      'CI/CD for firmware projects',
    ],
    hardwareRequired: false,
    gpuRequired: false,
    beginnerFriendly: true,
    installCommand: 'pip install platformio',
    verifiedAt: '2026-09-15',
  },
  {
    id: 'mosquitto',
    name: 'Eclipse Mosquitto',
    domain: 'iot',
    license: 'EPL-2.0',
    url: 'https://mosquitto.org/',
    docsUrl: 'https://mosquitto.org/documentation/',
    description: 'Lightweight MQTT broker for IoT messaging simulation and testing.',
    useCases: [
      'MQTT publish/subscribe messaging',
      'Simulating IoT telemetry pipelines',
      'Local broker for device testing',
    ],
    hardwareRequired: false,
    gpuRequired: false,
    beginnerFriendly: true,
    installCommand: 'sudo apt install mosquitto mosquitto-clients',
    verifiedAt: '2026-09-15',
  },
  {
    id: 'node-red',
    name: 'Node-RED',
    domain: 'iot',
    license: 'Apache-2.0',
    url: 'https://nodered.org/',
    docsUrl: 'https://nodered.org/docs/',
    description: 'Flow-based visual IoT programming tool for wiring hardware, APIs, and services.',
    useCases: [
      'IoT dashboard and alerting flows',
      'MQTT-to-HTTP bridging',
      'Sensor data visualization',
      'Webhook integrations',
    ],
    hardwareRequired: false,
    gpuRequired: false,
    beginnerFriendly: true,
    installCommand: 'npm install -g --unsafe-perm node-red',
    verifiedAt: '2026-09-15',
  },
  {
    id: 'thingsboard-ce',
    name: 'ThingsBoard Community Edition',
    domain: 'iot',
    license: 'Apache-2.0',
    url: 'https://thingsboard.io/',
    docsUrl: 'https://thingsboard.io/docs/',
    description: 'Open-source IoT platform for device management, data collection, and visualization.',
    useCases: [
      'IoT dashboard with real-time widgets',
      'Rule engine for alert automation',
      'Multi-protocol device integration (MQTT, HTTP, CoAP)',
    ],
    hardwareRequired: false,
    gpuRequired: false,
    beginnerFriendly: false,
    installCommand: 'docker run -it -p 9090:9090 thingsboard/tb-postgres',
    verifiedAt: '2026-09-15',
  },
  {
    id: 'tinkercad-circuits',
    name: 'Tinkercad Circuits',
    domain: 'iot',
    license: 'free-to-use',
    url: 'https://www.tinkercad.com/circuits',
    docsUrl: 'https://www.tinkercad.com/learn/circuits',
    description: 'Browser-based circuit and Arduino simulator from Autodesk.',
    useCases: [
      'Digital circuit prototyping',
      'Arduino code simulation',
      'Basic electronics education',
    ],
    hardwareRequired: false,
    gpuRequired: false,
    beginnerFriendly: true,
    verifiedAt: '2026-09-15',
  },
];

/**
 * Returns tools appropriate for a given domain and beginner level.
 */
export function getToolsForDomain(domain: 'iot' | 'robotics', beginnerOnly = false): SimulationTool[] {
  return SIMULATION_TOOLS.filter(
    (t) =>
      (t.domain === domain || t.domain === 'both') &&
      (!beginnerOnly || t.beginnerFriendly),
  );
}

/**
 * Returns a tool by its stable slug ID.
 */
export function getToolById(id: string): SimulationTool | undefined {
  return SIMULATION_TOOLS.find((t) => t.id === id);
}

/**
 * Returns tool recommendations formatted for LLM context injection.
 */
export function getToolRecommendationsText(domain: 'iot' | 'robotics'): string {
  const tools = getToolsForDomain(domain);
  return tools
    .map(
      (t) =>
        `- **${t.name}** (${t.license}, ${t.beginnerFriendly ? 'beginner-friendly' : 'intermediate'}): ${t.description} — ${t.url}`,
    )
    .join('\n');
}
