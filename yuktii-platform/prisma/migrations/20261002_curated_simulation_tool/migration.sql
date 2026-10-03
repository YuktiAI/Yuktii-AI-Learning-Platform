-- Migration: 20261002_curated_simulation_tool
-- Workstream D: Curated simulation tool registry & implementation path support

CREATE TABLE IF NOT EXISTS "CuratedSimulationTool" (
  "id"           TEXT     NOT NULL PRIMARY KEY,
  "name"         TEXT     NOT NULL,
  "url"          TEXT     NOT NULL,
  "domains"      TEXT     NOT NULL,    -- JSON array of domain slugs: ["iot","robotics"]
  "category"     TEXT     NOT NULL,    -- "circuit-simulator" | "robot-simulator" | "cloud-iot" | "embedded-emulator"
  "license"      TEXT     NOT NULL DEFAULT 'Open Source',
  "openSource"   BOOLEAN  NOT NULL DEFAULT TRUE,
  "freeToUse"    BOOLEAN  NOT NULL DEFAULT TRUE,
  "gpuRequired"  BOOLEAN  NOT NULL DEFAULT FALSE,
  "os"           TEXT     NOT NULL DEFAULT 'Linux, Windows, macOS',
  "bestFor"      TEXT,
  "verifiedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "freeTier"     BOOLEAN  NOT NULL DEFAULT TRUE,
  "browserBased" BOOLEAN  NOT NULL DEFAULT FALSE,
  "description"  TEXT     NOT NULL,
  "difficulty"   TEXT     NOT NULL DEFAULT 'all',
  "isActive"     BOOLEAN  NOT NULL DEFAULT TRUE,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CuratedSimulationTool_domains_idx" ON "CuratedSimulationTool"("domains");

-- Support implementationPath on StageProgress, Submission, SubmissionRecord, and Enrollment
ALTER TABLE "StageProgress"    ADD COLUMN IF NOT EXISTS "implementationPath" TEXT;
ALTER TABLE "Submission"       ADD COLUMN IF NOT EXISTS "implementationPath" TEXT;
ALTER TABLE "SubmissionRecord" ADD COLUMN IF NOT EXISTS "implementationPath" TEXT;
ALTER TABLE "Enrollment"       ADD COLUMN IF NOT EXISTS "implementationPath" TEXT;

-- Seed with curated, student-usable tools directly from Workstream D curated registry
INSERT INTO "CuratedSimulationTool" ("id","name","url","domains","category","license","openSource","freeToUse","gpuRequired","os","bestFor","verifiedAt","freeTier","browserBased","description","difficulty","isActive","createdAt","updatedAt")
VALUES
  -- Robotics
  ('cst_gazebo',       'ROS 2 + Gazebo (Gazebo Sim)', 'https://gazebosim.org',            '["robotics"]',               'robot-simulator',   'Apache 2.0',                     TRUE,  TRUE,  FALSE, 'Linux (Ubuntu), macOS/Windows via WSL2/Docker', 'Standard stack for mobile robots, navigation, sensors; works with Nav2, MoveIt 2, RViz.', NOW(), TRUE, FALSE, 'ROS-integrated 3D physics-accurate robot simulation environment.', 'advanced',     TRUE, NOW(), NOW()),
  ('cst_webots',       'Webots',                      'https://cyberbotics.com',          '["robotics"]',               'robot-simulator',   'Apache 2.0',                     TRUE,  TRUE,  FALSE, 'Linux, Windows, macOS',                         'Cross-platform, beginner-friendly, ready-made robot models, Python/C++/ROS 2 controllers. Good default for students new to robotics.', NOW(), TRUE, FALSE, 'Open-source 3D robot simulator by Cyberbotics — Python/ROS/C++ supported.', 'beginner', TRUE, NOW(), NOW()),
  ('cst_pybullet',     'PyBullet',                    'https://pybullet.org',             '["robotics","ai-ml"]',       'physics-simulator', 'zlib',                           TRUE,  TRUE,  FALSE, 'Linux, Windows, macOS',                         'Pure Python, lightweight, runs on low-end laptops and headless, good for manipulators, reinforcement learning and quick prototypes.', NOW(), TRUE, FALSE, 'Python physics simulation for robotics reinforcement learning and control.', 'intermediate', TRUE, NOW(), NOW()),
  ('cst_mujoco',       'MuJoCo',                      'https://mujoco.org',               '["robotics","ai-ml"]',       'physics-simulator', 'Apache 2.0',                     TRUE,  TRUE,  FALSE, 'Linux, Windows, macOS',                         'Fast physics for manipulation, locomotion and RL; works with Python bindings and Gymnasium.', NOW(), TRUE, FALSE, 'High-performance physics engine for robot simulation and RL research.', 'advanced', TRUE, NOW(), NOW()),
  ('cst_carla',        'CARLA',                       'https://carla.org',                '["robotics","ai-ml"]',       'robot-simulator',   'MIT (code) / CC (assets)',       TRUE,  TRUE,  TRUE,  'Linux, Windows',                                'Autonomous-driving simulation; GPU-heavy, recommend only when student machine has a dedicated GPU.', NOW(), TRUE, FALSE, 'Open-source autonomous driving simulator with urban environments and sensor simulation.', 'advanced', TRUE, NOW(), NOW()),
  ('cst_turtlesim',    'Turtlesim / RViz',            'https://docs.ros.org/en/humble/Tutorials/Beginner-CLI-Tools/Introducing-Turtlesim/Introducing-Turtlesim.html', '["robotics"]', 'robot-simulator', 'Apache 2.0', TRUE, TRUE, FALSE, 'Linux, Windows (WSL2), macOS', 'Very light entry point for absolute beginners learning ROS 2 concepts.', NOW(), TRUE, FALSE, 'Lightweight ROS 2 visualization and beginner robot simulation tool.', 'beginner', TRUE, NOW(), NOW()),
  ('cst_coppelia',     'CoppeliaSim',                 'https://www.coppeliarobotics.com', '["robotics"]',               'robot-simulator',   'Proprietary (Free Educational)', FALSE, TRUE,  FALSE, 'Linux, Windows, macOS',                         'Cross-platform robot simulator with Lua/Python scripting and ROS bridge.', NOW(), TRUE, FALSE, 'Feature-rich robot simulator with multi-language APIs and realistic dynamics.', 'intermediate', TRUE, NOW(), NOW()),
  ('cst_isaac_sim',    'NVIDIA Isaac Sim',            'https://developer.nvidia.com/isaac-sim', '["robotics"]',        'robot-simulator',   'Proprietary (Free with NVIDIA)', FALSE, TRUE,  TRUE,  'Linux, Windows',                                'Photorealistic robotics simulation requiring NVIDIA RTX GPU.', NOW(), TRUE, FALSE, 'Advanced robotics simulation powered by NVIDIA Omniverse and PhysX.', 'advanced', TRUE, NOW(), NOW()),

  -- IoT
  ('cst_wokwi',        'Wokwi',                       'https://wokwi.com',                '["iot","embedded"]',         'circuit-simulator', 'Proprietary (Free online)',      FALSE, TRUE,  FALSE, 'Browser-based (any OS)',                        'Free online simulator for Arduino, ESP32, Raspberry Pi Pico with virtual sensors/displays; runs in browser without install.', NOW(), TRUE, TRUE, 'Browser-based Arduino/ESP32/Raspberry Pi Pico simulator — no install needed.', 'beginner', TRUE, NOW(), NOW()),
  ('cst_renode',       'Renode',                      'https://renode.io',                '["iot","embedded"]',         'embedded-emulator', 'BSD 2-Clause',                   TRUE,  TRUE,  FALSE, 'Linux, Windows, macOS',                         'Firmware-level emulation of microcontrollers and boards; headless execution in CI/sandbox.', NOW(), TRUE, FALSE, 'Antmicro open-source multinode simulation framework for embedded systems.', 'advanced', TRUE, NOW(), NOW()),
  ('cst_qemu',         'QEMU Embedded',               'https://www.qemu.org',             '["iot","embedded"]',         'embedded-emulator', 'GPLv2',                          TRUE,  TRUE,  FALSE, 'Linux, Windows, macOS',                         'Full-system and embedded core emulation for ARM/RISC-V/x86 architectures.', NOW(), TRUE, FALSE, 'Open-source machine emulator and virtualizer supporting embedded target boards.', 'advanced', TRUE, NOW(), NOW()),
  ('cst_simulide',     'SimulIDE',                    'https://simulide.com',             '["iot","embedded"]',         'circuit-simulator', 'GPLv3',                          TRUE,  TRUE,  FALSE, 'Linux, Windows, macOS',                         'Real-time electronic circuit simulation with PIC, AVR, and Arduino microcontrollers.', NOW(), TRUE, FALSE, 'Simple real-time electronic circuit simulator with microcontroller simulation.', 'intermediate', TRUE, NOW(), NOW()),
  ('cst_platformio',   'PlatformIO Core',             'https://platformio.org',           '["iot","embedded"]',         'embedded-emulator', 'Apache 2.0',                     TRUE,  TRUE,  FALSE, 'Linux, Windows, macOS',                         'Build and test embedded firmware, supports native unit tests without hardware.', NOW(), TRUE, FALSE, 'Professional embedded development platform with cross-platform build system and unit testing.', 'intermediate', TRUE, NOW(), NOW()),
  ('cst_mosquitto',    'Eclipse Mosquitto',           'https://mosquitto.org',            '["iot","embedded"]',         'mqtt-broker',       'EPL 2.0 / EDL 1.0',              TRUE,  TRUE,  FALSE, 'Linux, Windows, macOS',                         'Lightweight MQTT broker for local simulated device messaging.', NOW(), TRUE, FALSE, 'Open-source MQTT broker — run locally or via public test broker.', 'intermediate', TRUE, NOW(), NOW()),
  ('cst_node_red',     'Node-RED',                    'https://nodered.org',              '["iot","embedded","cloud"]', 'flow-programming', 'Apache 2.0',                     TRUE,  TRUE,  FALSE, 'Linux, Windows, macOS, Docker',                 'Flow-based low-code visual programming for IoT logic and simulated sensor telemetry.', NOW(), TRUE, FALSE, 'Low-code programming for event-driven IoT data flows and virtual device telemetry.', 'beginner', TRUE, NOW(), NOW()),
  ('cst_thingsboard',  'ThingsBoard Community',       'https://thingsboard.io',           '["iot","cloud"]',            'cloud-iot',         'Apache 2.0',                     TRUE,  TRUE,  FALSE, 'Linux, Docker, Windows',                        'Open-source IoT platform for dashboards, device management and rules, receives simulated telemetry.', NOW(), TRUE, FALSE, 'Open-source IoT platform for device management, data collection, processing and visualization.', 'intermediate', TRUE, NOW(), NOW()),
  ('cst_tinkercad',    'TinkerCAD Circuits',          'https://www.tinkercad.com/circuits','["iot","embedded"]',        'circuit-simulator', 'Proprietary (Free online)',      FALSE, TRUE,  FALSE, 'Browser-based (any OS)',                        'Free Autodesk browser-based Arduino circuit & code simulator for beginners.', NOW(), TRUE, TRUE, 'Autodesk free browser-based Arduino circuit & code simulator.', 'beginner', TRUE, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "url" = EXCLUDED."url",
  "domains" = EXCLUDED."domains",
  "category" = EXCLUDED."category",
  "license" = EXCLUDED."license",
  "openSource" = EXCLUDED."openSource",
  "freeToUse" = EXCLUDED."freeToUse",
  "gpuRequired" = EXCLUDED."gpuRequired",
  "os" = EXCLUDED."os",
  "bestFor" = EXCLUDED."bestFor",
  "verifiedAt" = EXCLUDED."verifiedAt",
  "freeTier" = EXCLUDED."freeTier",
  "browserBased" = EXCLUDED."browserBased",
  "description" = EXCLUDED."description",
  "difficulty" = EXCLUDED."difficulty",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = NOW();
