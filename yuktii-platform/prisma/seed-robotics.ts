
// ── Robotics Project Blueprints (seeded via addendum) ─────────────────────
const ROBOTICS_BLUEPRINTS = [
  { title: 'Line-Following Robot', components: JSON.stringify(['Arduino Uno','IR Sensors (x2)','DC Motors (x2)','L298N Motor Driver','Chassis','9V Battery']), simulatorName: 'Wokwi', simulatorUrl: 'https://wokwi.com/projects/new/arduino-uno', hardwareOptional: true, difficultyLevel: 'foundation', category: 'line-following', description: 'Robot follows a black line on white surface using two IR sensors and differential drive.' },
  { title: 'Obstacle-Avoidance Rover', components: JSON.stringify(['Arduino Uno','HC-SR04 Ultrasonic Sensor','DC Motors (x2)','L298N Motor Driver','Chassis','9V Battery']), simulatorName: 'TinkerCAD', simulatorUrl: 'https://www.tinkercad.com/circuits', hardwareOptional: true, difficultyLevel: 'foundation', category: 'navigation', description: 'Rover detects obstacles via ultrasonic sensor and steers around them autonomously.' },
  { title: 'Ultrasonic Distance-Alert Bot', components: JSON.stringify(['Arduino Uno','HC-SR04 Ultrasonic Sensor','Buzzer','LED (x3)','Breadboard','Jumper Wires']), simulatorName: 'Wokwi', simulatorUrl: 'https://wokwi.com/projects/new/arduino-uno', hardwareOptional: true, difficultyLevel: 'foundation', category: 'navigation', description: 'Stationary bot that alerts via buzzer and LEDs when an object enters a proximity zone.' },
  { title: 'Bluetooth-Controlled RC Car', components: JSON.stringify(['Arduino Uno','HC-05 Bluetooth Module','DC Motors (x4)','L298N Motor Driver','Car Chassis','7.4V Li-ion Battery Pack']), simulatorName: null, simulatorUrl: null, hardwareOptional: false, difficultyLevel: 'foundation', category: 'navigation', description: 'Mobile car controlled via Bluetooth from a smartphone app. Hardware path only.' },
  { title: 'Light-Seeking Robot (Phototropic Bot)', components: JSON.stringify(['Arduino Uno','LDR Sensors (x2)','DC Motors (x2)','L298N Motor Driver','Chassis','9V Battery']), simulatorName: 'Wokwi', simulatorUrl: 'https://wokwi.com/projects/new/arduino-uno', hardwareOptional: true, difficultyLevel: 'foundation', category: 'navigation', description: 'Robot steers toward brightest light source using two LDR sensors for differential comparison.' },
  { title: 'Self-Balancing Robot', components: JSON.stringify(['Arduino Uno','MPU-6050 IMU','DC Motors (x2)','L298N Motor Driver','Wheels','7.4V LiPo Battery']), simulatorName: 'Webots', simulatorUrl: 'https://cyberbotics.com/doc/guide/tutorials', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'navigation', description: 'Two-wheeled inverted pendulum robot that balances using PID control with IMU feedback.' },
  { title: 'IR-Controlled Robotic Arm (3-DOF)', components: JSON.stringify(['Arduino Uno','SG90 Servo Motors (x3)','IR Receiver Module','IR Remote','Acrylic Arm Links','5V Power Supply']), simulatorName: 'Webots', simulatorUrl: 'https://cyberbotics.com/doc/guide/tutorials', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'manipulation', description: '3-DOF robotic arm controlled via infrared remote for pick and place operations.' },
  { title: 'Gesture-Controlled Robot', components: JSON.stringify(['Arduino Uno (x2)','MPU-6050 IMU','nRF24L01 Wireless Module (x2)','DC Motors (x2)','L298N Motor Driver','Chassis']), simulatorName: 'Webots', simulatorUrl: 'https://cyberbotics.com/doc/guide/tutorials', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'manipulation', description: 'Robot controlled by hand gestures detected via IMU wrist controller; data sent wirelessly.' },
  { title: 'Maze-Solving Robot (Left-Wall Follower)', components: JSON.stringify(['Arduino Uno','IR Sensors (x3)','DC Motors (x2)','L298N Motor Driver','Chassis','9V Battery']), simulatorName: 'Webots', simulatorUrl: 'https://cyberbotics.com/doc/guide/tutorials', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'navigation', description: 'Robot navigates a maze using the left-wall-follower algorithm.' },
  { title: 'Color-Based Object Sorting Robot', components: JSON.stringify(['Arduino Uno','TCS34725 Color Sensor','SG90 Servo (x2)','Conveyor Mechanism','Sorting Bins','5V Power Supply']), simulatorName: 'CoppeliaSim', simulatorUrl: 'https://www.coppeliarobotics.com/', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'object-detection', description: 'Robot sorts objects by detected color into designated bins using servo-actuated arm.' },
  { title: '2-Robot Swarm (Leader-Follower)', components: JSON.stringify(['Arduino Uno (x2)','nRF24L01 Wireless Modules (x2)','DC Motors (x4)','L298N Motor Drivers (x2)','Chassis (x2)']), simulatorName: 'Webots', simulatorUrl: 'https://cyberbotics.com/doc/guide/tutorials', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'swarm', description: 'Two-robot swarm where follower mimics leader movement in real-time via wireless link.' },
  { title: 'Firefighting Robot', components: JSON.stringify(['Arduino Uno','Flame Sensors (x3)','Water Pump + Relay','DC Motors (x2)','L298N Motor Driver','Chassis','9V Battery']), simulatorName: null, simulatorUrl: null, hardwareOptional: false, difficultyLevel: 'intermediate', category: 'navigation', description: 'Autonomous robot that detects fire and activates a water pump to extinguish it.' },
  { title: 'Autonomous Mobile Robot with ROS 2', components: JSON.stringify(['Raspberry Pi 4','RPLIDAR A1','DC Motors with Encoders (x4)','Motor Controller','IMU','Battery Pack']), simulatorName: 'Gazebo', simulatorUrl: 'https://gazebosim.org/docs', hardwareOptional: true, difficultyLevel: 'advanced', category: 'navigation', description: 'Full AMR with ROS 2 Nav2: SLAM mapping, localization, path planning, and obstacle avoidance.' },
  { title: 'Vision-Guided Pick-and-Place Arm', components: JSON.stringify(['Raspberry Pi 4','Pi Camera Module v2','Servo Motors (x6)','Robotic Arm Kit','5V/3A Power Supply']), simulatorName: 'Gazebo', simulatorUrl: 'https://gazebosim.org/docs', hardwareOptional: true, difficultyLevel: 'advanced', category: 'vision-guided', description: 'Robotic arm uses OpenCV to detect and pick objects by position.' },
  { title: 'Quadruped Walking Robot', components: JSON.stringify(['Raspberry Pi 4','MG996R Servo Motors (x12)','PCA9685 Servo Driver','3D-printed Chassis','7.4V LiPo Battery','IMU']), simulatorName: 'Webots', simulatorUrl: 'https://cyberbotics.com/doc/guide/tutorials', hardwareOptional: true, difficultyLevel: 'advanced', category: 'navigation', description: 'Four-legged walking robot with inverse kinematics-based gait patterns.' },
  { title: 'Drone Waypoint Navigation', components: JSON.stringify(['Pixhawk Flight Controller','Motors (x4) + ESCs','Frame','GPS Module','Radio Transmitter','LiPo Battery 4S']), simulatorName: 'Webots', simulatorUrl: 'https://cyberbotics.com/doc/guide/tutorials', hardwareOptional: true, difficultyLevel: 'advanced', category: 'navigation', description: 'Drone navigates GPS waypoints using ArduPilot. Simulation-first recommended.' },
  { title: 'SLAM-Based Mapping Robot', components: JSON.stringify(['Raspberry Pi 4','RPLIDAR A1','DC Motors with Encoders','Motor Driver','IMU','Portable Battery']), simulatorName: 'Gazebo', simulatorUrl: 'https://gazebosim.org/docs', hardwareOptional: true, difficultyLevel: 'advanced', category: 'navigation', description: 'Robot builds a 2D occupancy grid map of unknown environment using gmapping SLAM.' },
  { title: 'Agricultural Crop-Row Navigation Bot', components: JSON.stringify(['Raspberry Pi 4','Pi Camera Module v2','DC Motors with Encoders (x4)','Motor Controller','Ultrasonic Sensors (x2)','12V Battery']), simulatorName: 'Webots', simulatorUrl: 'https://cyberbotics.com/doc/guide/tutorials', hardwareOptional: true, difficultyLevel: 'advanced', category: 'vision-guided', description: 'Robot navigates along crop rows using camera-based lane detection and turns at row ends.' },
];

async function seedRobotics() {
  const { PrismaClient } = require('@prisma/client');
  const { generateStageContent } = require('../lib/ai-content');
  const db = new PrismaClient();
  try {
    for (const bp of ROBOTICS_BLUEPRINTS) {
      const exists = await db.roboticsProjectBlueprint.findFirst({ where: { title: bp.title } });
      if (!exists) await db.roboticsProjectBlueprint.create({ data: bp });
    }
    console.log('Robotics blueprints seeded.');

    const domain = await db.domain.upsert({
      where: { slug: 'robotics' },
      update: { name: 'Robotics', tagline: 'Build Machines That Move.', description: 'Design and demonstrate autonomous robotic systems.' },
      create: { name: 'Robotics', slug: 'robotics', tagline: 'Build Machines That Move.', description: 'Design and demonstrate autonomous robotic systems.' },
    });

    const DURATIONS = [
      { duration: 30, levelName: 'FOUNDATION', certName: 'Foundation Certificate', price: 149900, stageCount: 3 },
      { duration: 45, levelName: 'FOUNDATION_PLUS', certName: 'Foundation+ Certificate', price: 249900, stageCount: 4 },
      { duration: 60, levelName: 'PRACTITIONER', certName: 'Practitioner Certificate', price: 349900, stageCount: 5 },
      { duration: 75, levelName: 'APPLIED_PRACTITIONER', certName: 'Applied Practitioner Certificate', price: 449900, stageCount: 6 },
      { duration: 90, levelName: 'CAPSTONE', certName: 'Capstone Certificate', price: 599900, stageCount: 8 },
    ];
    for (const tier of DURATIONS) {
      const track = await db.track.upsert({
        where:  { domainId_duration: { domainId: domain.id, duration: tier.duration } },
        update: { levelName: tier.levelName, certificateName: tier.certName, price: tier.price, isPublished: true },
        create: { domainId: domain.id, duration: tier.duration, levelName: tier.levelName, certificateName: tier.certName, price: tier.price, isPublished: true },
      });
      for (let s = 1; s <= tier.stageCount; s++) {
        const content = await generateStageContent('Robotics', tier.levelName, s, tier.stageCount, 'robotics');
        await db.stage.upsert({
          where:  { trackId_stageNumber: { trackId: track.id, stageNumber: s } },
          update: { title: content.title, plainLanguageIntro: content.plainLanguageIntro, learningObjectives: content.learningObjectives, taskTemplate: content.taskTemplate, modelAnswer: content.modelAnswer, rubricJson: content.rubricJson },
          create: { trackId: track.id, stageNumber: s, title: content.title, plainLanguageIntro: content.plainLanguageIntro, learningObjectives: content.learningObjectives, taskTemplate: content.taskTemplate, modelAnswer: content.modelAnswer, rubricJson: content.rubricJson },
        });
        console.log(`  Robotics | ${tier.levelName} | Stage ${s}/${tier.stageCount} done`);
      }
    }
    console.log('Robotics domain and tracks seeded.');
  } finally {
    await db.$disconnect();
  }
}

seedRobotics().catch(console.error);
