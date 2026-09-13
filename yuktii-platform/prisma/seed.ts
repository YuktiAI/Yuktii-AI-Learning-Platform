import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
// ai-content.ts uses Groq (if GROQ_API_KEY set) or generic fallback
// Import type-only for seed since we use dynamic import for env to be loaded first
import { generateStageContent } from '../lib/ai-content';

const prisma = new PrismaClient();

const DOMAINS = [
  { name: 'AI/ML', slug: 'ai-ml', tagline: 'Teach a Machine to Think — Then Prove It Can.', description: 'Build, train, and evaluate real machine learning models from data prep to model deployment.' },
  { name: 'LLM & Generative AI', slug: 'llm-generative-ai', tagline: 'Build RAG Pipelines and Autonomous Agents.', description: 'Prompt engineering, RAG architectures, vector databases, and LLM-powered agent workflows.' },
  { name: 'Data Science', slug: 'data-science', tagline: 'Turn Numbers Into Predictions.', description: 'Work through a full data science lifecycle on a real-world style dataset.' },
  { name: 'Data Analysis', slug: 'data-analysis', tagline: 'Make the Data Talk.', description: 'Turn raw spreadsheets and dashboards into decisions a business can act on.' },
  { name: 'IoT', slug: 'iot', tagline: 'Give Everyday Things a Brain.', description: 'Design and simulate a connected device pipeline.' },
  { name: 'Full Stack Development (Java)', slug: 'fullstack-java', tagline: 'Build the Engine Behind the Screen.', description: 'Ship a complete Java-backed web application end to end.' },
  { name: 'ERP (Odoo)', slug: 'erp-odoo', tagline: 'The Skill Every Company Needs, That No One Else Is Teaching.', description: 'Configure and customize a working Odoo ERP module for a real business process.' },
  { name: 'Data Engineering', slug: 'data-engineering', tagline: 'Build the Pipes Every Data Team Depends On.', description: 'Design an ingestion-to-warehouse pipeline.' },
  { name: 'Full Stack Development (Python)', slug: 'fullstack-python', tagline: 'One Language. A Complete Application.', description: 'Build a production-style application end to end in Python.' },
];

const DURATIONS = [
  { duration: 30, levelName: 'FOUNDATION', certName: 'Foundation Certificate', price: 149900, stageCount: 3 },
  { duration: 45, levelName: 'FOUNDATION_PLUS', certName: 'Foundation+ Certificate', price: 249900, stageCount: 4 },
  { duration: 60, levelName: 'PRACTITIONER', certName: 'Practitioner Certificate', price: 349900, stageCount: 5 },
  { duration: 75, levelName: 'APPLIED_PRACTITIONER', certName: 'Applied Practitioner Certificate', price: 449900, stageCount: 6 },
  { duration: 90, levelName: 'CAPSTONE', certName: 'Capstone Certificate', price: 599900, stageCount: 8 },
];

async function main() {
  console.log('Starting seed process...');

  const aiMlDomain = await prisma.domain.upsert({
    where: { slug: 'ai-ml' },
    update: { name: 'AI/ML', tagline: 'Teach a Machine to Think — Then Prove It Can.', description: 'Build, train, and evaluate real machine learning models from data prep to model deployment.' },
    create: { name: 'AI/ML', slug: 'ai-ml', tagline: 'Teach a Machine to Think — Then Prove It Can.', description: 'Build, train, and evaluate real machine learning models from data prep to model deployment.' },
  });

  for (const d of DOMAINS) {
    const isLlm = d.slug === 'llm-generative-ai';
    const domainData = isLlm ? { ...d, prerequisiteDomainId: aiMlDomain.id } : d;
    const domain = await prisma.domain.upsert({
      where: { slug: d.slug },
      update: { name: d.name, tagline: d.tagline, description: d.description, prerequisiteDomainId: isLlm ? aiMlDomain.id : undefined },
      create: domainData,
    });

    for (const tier of DURATIONS) {
      const track = await prisma.track.upsert({
        where: { domainId_duration: { domainId: domain.id, duration: tier.duration } },
        update: { levelName: tier.levelName, certificateName: tier.certName, price: tier.price, isPublished: true },
        create: {
          domainId: domain.id,
          duration: tier.duration,
          levelName: tier.levelName,
          certificateName: tier.certName,
          price: tier.price,
          isPublished: true,
        },
      });

      for (let s = 1; s <= tier.stageCount; s++) {
        console.log(`  Generating content: ${d.name} | ${tier.levelName} | Stage ${s}/${tier.stageCount}`);
        const content = await generateStageContent(d.name, tier.levelName, s, tier.stageCount, d.slug);

        await prisma.stage.upsert({
          where: { trackId_stageNumber: { trackId: track.id, stageNumber: s } },
          update: {
            title: content.title,
            plainLanguageIntro: content.plainLanguageIntro,
            learningObjectives: content.learningObjectives,
            taskTemplate: content.taskTemplate,
            modelAnswer: content.modelAnswer,
            rubricJson: content.rubricJson,
          },
          create: {
            trackId: track.id,
            stageNumber: s,
            title: content.title,
            plainLanguageIntro: content.plainLanguageIntro,
            learningObjectives: content.learningObjectives,
            taskTemplate: content.taskTemplate,
            modelAnswer: content.modelAnswer,
            rubricJson: content.rubricJson,
          },
        });
      }
    }
  }

  // Create Admin
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@yuktiiai.in';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'changeme123';
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.student.upsert({
    where: { email: adminEmail },
    update: {},
    create: { name: 'Yuktii AI Labs Admin', email: adminEmail, passwordHash, role: 'ADMIN' },
  });

  // Create Test Student
  const testStudentEmail = 'student@example.com';
  const testStudentPasswordHash = await bcrypt.hash('password123', 10);
  await prisma.student.upsert({
    where: { email: testStudentEmail },
    update: {},
    create: {
      name: 'Test Student',
      email: testStudentEmail,
      phone: '+919876543210',
      college: 'IIT Delhi',
      passwordHash: testStudentPasswordHash,
      role: 'STUDENT',
    },
  });

  // ── Seed curated DatasetResource records ───────────────────────────────────
  const DATASETS = [
    // AI/ML & Data Science
    { name: 'Titanic - Machine Learning from Disaster', url: 'https://www.kaggle.com/datasets/yasserh/titanic-dataset', domainTags: 'ai-ml,ai-ml-llm-apps,data-science,data-analysis', sourcePlatform: 'Kaggle', description: 'Binary classification: passenger survival prediction. 891 rows, 12 features including age, fare, cabin class.' },
    { name: 'House Prices - Advanced Regression', url: 'https://www.kaggle.com/competitions/house-prices-advanced-regression-techniques/data', domainTags: 'ai-ml,ai-ml-llm-apps,data-science', sourcePlatform: 'Kaggle', description: 'Regression: residential home sale prices in Iowa. 1460 rows, 81 features covering lot size, condition, neighbourhood.' },
    { name: 'Credit Card Fraud Detection', url: 'https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud', domainTags: 'ai-ml,ai-ml-llm-apps,data-science', sourcePlatform: 'Kaggle', description: 'Binary classification: 284,807 credit card transactions, 492 fraudulent. Highly imbalanced. PCA-transformed features.' },
    { name: 'Telecom Customer Churn', url: 'https://www.kaggle.com/datasets/blastchar/telco-customer-churn', domainTags: 'ai-ml,ai-ml-llm-apps,data-science,data-analysis', sourcePlatform: 'Kaggle', description: 'Binary classification: telecom customer churn. 7,043 rows, 21 features including contract type, monthly charges, tenure.' },
    { name: 'UCI Adult Income (Census Income)', url: 'https://archive.ics.uci.edu/dataset/2/adult', domainTags: 'ai-ml,ai-ml-llm-apps,data-science,data-analysis', sourcePlatform: 'UCI', description: 'Binary classification: predict whether income exceeds $50K/year. 48,842 instances. Classic benchmark dataset.' },
    { name: 'UCI Wine Quality', url: 'https://archive.ics.uci.edu/dataset/186/wine+quality', domainTags: 'ai-ml,data-science,data-analysis', sourcePlatform: 'UCI', description: 'Regression/classification: wine quality score (0-10). 6,497 samples with 11 physicochemical input variables.' },
    { name: 'UCI Breast Cancer Wisconsin', url: 'https://archive.ics.uci.edu/dataset/17/breast+cancer+wisconsin+diagnostic', domainTags: 'ai-ml,data-science', sourcePlatform: 'UCI', description: 'Binary classification: malignant vs. benign breast cancer. 569 instances, 30 numeric features from tumour measurements.' },

    // Data Analysis
    { name: 'Superstore Sales Dataset', url: 'https://www.kaggle.com/datasets/vivek468/superstore-dataset-final', domainTags: 'data-analysis,erp-odoo', sourcePlatform: 'Kaggle', description: 'Retail sales transaction data: 9,994 rows. Region, category, sub-category, profit, discount. Good for dashboard and trend analysis.' },
    { name: 'Global COVID-19 Dataset', url: 'https://github.com/owid/covid-19-data/blob/master/public/data/owid-covid-data.csv', domainTags: 'data-analysis,data-science', sourcePlatform: 'Other', description: 'Time-series epidemiological data from Our World in Data. Cases, deaths, vaccinations by country and date.' },
    { name: 'US Flight Delays 2015', url: 'https://www.kaggle.com/datasets/usdot/flight-delays', domainTags: 'data-analysis,data-engineering', sourcePlatform: 'Kaggle', description: '5.8 million domestic flight records: origin, destination, delay cause, delay duration. Good for aggregation and dashboard work.' },

    // Data Engineering
    { name: 'NYC Taxi Trip Data (Parquet)', url: 'https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page', domainTags: 'data-engineering', sourcePlatform: 'DataGov', description: 'Multi-million row taxi trip records in Parquet format. Ideal for ETL pipelines, partitioning, and warehouse loading exercises.' },
    { name: 'Yelp Open Dataset', url: 'https://www.yelp.com/dataset', domainTags: 'data-engineering,data-analysis,llm-generative-ai', sourcePlatform: 'Other', description: 'JSON dataset: 6.7M reviews, 192K businesses. Useful for JSON ingestion pipelines, NLP, and large-scale ETL work.' },
    { name: 'HuggingFace Wikipedia Corpus', url: 'https://huggingface.co/datasets/wikipedia', domainTags: 'data-engineering,llm-generative-ai,ai-ml', sourcePlatform: 'HuggingFace', description: 'Full Wikipedia text in multiple languages. Useful for embedding generation, retrieval pipeline, and LLM fine-tuning data prep.' },

    // IoT
    { name: 'IoT Sensor Data for Smart Home', url: 'https://www.kaggle.com/datasets/ranakrc/smart-home-system', domainTags: 'iot', sourcePlatform: 'Kaggle', description: 'Time-series sensor readings: temperature, humidity, motion, luminosity. 200K+ readings across 5 room types.' },
    { name: 'UCI Air Quality Dataset', url: 'https://archive.ics.uci.edu/dataset/360/air+quality', domainTags: 'iot,data-analysis', sourcePlatform: 'UCI', description: 'Hourly air quality sensor data from an Italian city. 9,358 instances, 15 attributes including CO, NOx, benzene concentrations.' },

    // LLM & Generative AI
    { name: 'HuggingFace GLUE Benchmark', url: 'https://huggingface.co/datasets/nyu-mll/glue', domainTags: 'llm-generative-ai,ai-ml', sourcePlatform: 'HuggingFace', description: 'General Language Understanding Evaluation benchmark. Multiple NLP tasks: sentiment, entailment, similarity. Standard LLM eval suite.' },
    { name: 'HuggingFace Common Voice (English)', url: 'https://huggingface.co/datasets/mozilla-foundation/common_voice_11_0', domainTags: 'llm-generative-ai', sourcePlatform: 'HuggingFace', description: 'Speech corpus: 2,454 hours of validated English speech. Useful for speech-to-text LLM pipeline projects.' },

    // Full Stack / ERP
    { name: 'Online Retail Transactions (UCI)', url: 'https://archive.ics.uci.edu/dataset/352/online+retail', domainTags: 'fullstack-python,fullstack-java,erp-odoo,data-analysis', sourcePlatform: 'UCI', description: 'Transactional data: 541,909 rows from a UK online retailer. Stock codes, descriptions, quantities, unit prices, country.' },
    { name: 'E-commerce Product Reviews', url: 'https://www.kaggle.com/datasets/nicapotato/womens-ecommerce-clothing-reviews', domainTags: 'fullstack-python,fullstack-java,data-analysis,llm-generative-ai', sourcePlatform: 'Kaggle', description: '23,486 product reviews with star ratings, category, and free-text feedback. Good for sentiment analysis or review APIs.' },
    { name: 'Northwind Traders SQL Dataset', url: 'https://github.com/microsoft/sql-server-samples/tree/master/samples/databases/northwind-pubs', domainTags: 'fullstack-java,fullstack-python,erp-odoo,data-analysis', sourcePlatform: 'Other', description: 'Classic relational business database: customers, orders, products, suppliers. Standard for ERP and backend data modelling exercises.' },
  ];

  for (const ds of DATASETS) {
    await prisma.datasetResource.upsert({
      where: { id: ds.name }, // use name as stable key for upsert
      update: {},
      create: ds,
    }).catch(async () => {
      // If name-based upsert fails (id is cuid, not name), create if not exists
      const exists = await prisma.datasetResource.findFirst({ where: { name: ds.name } });
      if (!exists) await prisma.datasetResource.create({ data: ds });
    });
  }
  console.log(`Seeded ${DATASETS.length} curated DatasetResource records.`);

  // ── Seed IoTProjectBlueprint table ─────────────────────────────────────────
  // Simulator-first: all blueprints include a Wokwi simulatorUrl.
  // hardwareOptional: true on all blueprints — students with physical hardware
  // get an optional addendum note, but no blueprint REQUIRES hardware purchase.
  const IOT_BLUEPRINTS = [
    // ── FOUNDATION difficulty (3 blueprints per category, spread across 5 categories) ──
    // agriculture
    { title: 'Smart Soil Moisture Irrigation System', components: JSON.stringify(['ESP32', 'Soil Moisture Sensor (YL-69)', 'Relay Module', 'Mini Water Pump']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'foundation', category: 'agriculture', description: 'Monitor soil moisture and automatically trigger irrigation pump when soil is too dry. Classic beginner IoT automation.' },
    // home-automation
    { title: 'Smart Room Temperature & Humidity Monitor', components: JSON.stringify(['ESP32', 'DHT22 Sensor', 'OLED Display (SSD1306)', 'LED Indicator']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'foundation', category: 'home-automation', description: 'Read temperature and humidity from DHT22 and display on OLED. Trigger LED alert when threshold exceeded.' },
    // environmental-monitoring
    { title: 'Air Quality Index Display Station', components: JSON.stringify(['ESP32', 'MQ-135 Air Quality Sensor', 'LCD Display (16x2)', 'Buzzer']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'foundation', category: 'environmental-monitoring', description: 'Read MQ-135 gas sensor values, calculate a simple AQI proxy, display on LCD, and trigger buzzer if unsafe.' },
    // security
    { title: 'PIR Motion Detection Alert System', components: JSON.stringify(['ESP32', 'PIR Motion Sensor (HC-SR501)', 'LED', 'Buzzer']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'foundation', category: 'security', description: 'Detect motion with PIR sensor, trigger LED and buzzer alarm. Log detection timestamp to serial monitor.' },
    // health
    { title: 'Heart Rate & SpO2 Monitor Display', components: JSON.stringify(['ESP32', 'MAX30100 Pulse Oximeter Sensor', 'OLED Display (SSD1306)']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'foundation', category: 'health', description: 'Read pulse and oxygen saturation from MAX30100 and display live readings on OLED screen.' },
    // industrial
    { title: 'Machine Vibration Threshold Logger', components: JSON.stringify(['ESP32', 'SW-420 Vibration Sensor', 'LED', 'Serial Monitor']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'foundation', category: 'industrial', description: 'Detect vibration events above a threshold and log them with timestamps. Indicates machine abnormal vibration.' },

    // ── INTERMEDIATE difficulty ──
    // agriculture
    { title: 'Multi-Sensor Greenhouse Controller', components: JSON.stringify(['ESP32', 'DHT22 Sensor', 'Soil Moisture Sensor', 'Relay Module', 'Fan Motor', 'Water Pump']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'agriculture', description: 'Monitor temperature, humidity, and soil moisture simultaneously. Automate fan and irrigation based on thresholds.' },
    // home-automation
    { title: 'Smart Energy Consumption Monitor', components: JSON.stringify(['ESP32', 'ACS712 Current Sensor', 'OLED Display', 'WiFi Module (built-in)']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'home-automation', description: 'Measure household appliance current draw, calculate power consumption, and send data to a simple HTTP endpoint.' },
    // environmental-monitoring
    { title: 'River/Flood Water Level Early Warning System', components: JSON.stringify(['ESP32', 'Ultrasonic Sensor (HC-SR04)', 'LED Array', 'Buzzer', 'WiFi (built-in)']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'environmental-monitoring', description: 'Measure water level with ultrasonic sensor, classify into safe/warning/critical zones, trigger alerts and send HTTP notification.' },
    // security
    { title: 'RFID Access Control with Attendance Log', components: JSON.stringify(['ESP32', 'MFRC522 RFID Reader', 'RFID Cards/Tags', 'LCD Display', 'Relay Module']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'security', description: 'Scan RFID tags, validate against a whitelist, grant/deny door access via relay, log attendance to serial/HTTP.' },
    // industrial
    { title: 'Conveyor Belt Speed & Object Counter', components: JSON.stringify(['ESP32', 'IR Sensor (FC-51)', 'Encoder Motor', 'OLED Display', 'WiFi (built-in)']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'industrial', description: 'Count objects passing on a simulated conveyor, measure throughput rate, display live count and push metrics to dashboard.' },
    // health
    { title: 'Smart Medicine Reminder Dispenser', components: JSON.stringify(['ESP32', 'RTC Module (DS3231)', 'Servo Motor', 'Buzzer', 'OLED Display']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'intermediate', category: 'health', description: 'Use RTC for accurate time-keeping, trigger servo to dispense medicine at scheduled times, buzz and display reminder.' },

    // ── ADVANCED difficulty ──
    // agriculture
    { title: 'Predictive Irrigation System with MQTT Cloud Dashboard', components: JSON.stringify(['ESP32', 'Soil Moisture Sensor', 'DHT22', 'Relay Module', 'Water Pump', 'MQTT Broker (HiveMQ)']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'advanced', category: 'agriculture', description: 'Collect sensor data, apply a simple threshold + time-based prediction model, send data to MQTT broker, build dashboard.' },
    // environmental-monitoring
    { title: 'Air Quality Monitoring Network with Cloud Logging', components: JSON.stringify(['ESP32', 'MQ-135 Sensor', 'DHT22', 'BMP280 Barometric Sensor', 'WiFi', 'InfluxDB/HTTP endpoint']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'advanced', category: 'environmental-monitoring', description: 'Multi-sensor air quality station: gases, temperature, pressure. Send time-series to cloud endpoint, build monitoring dashboard.' },
    // security
    { title: 'Smart Surveillance System with Camera & Edge Detection', components: JSON.stringify(['ESP32-CAM', 'PIR Sensor', 'LED Flash', 'WiFi (built-in)', 'MQTT Broker']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'advanced', category: 'security', description: 'ESP32-CAM captures image on PIR trigger, sends image URL via MQTT, logs event to HTTP endpoint. Simulates smart camera.' },
    // industrial
    { title: 'Predictive Maintenance Vibration Analyzer', components: JSON.stringify(['ESP32', 'MPU-6050 Accelerometer/Gyroscope', 'OLED Display', 'WiFi', 'MQTT Broker']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'advanced', category: 'industrial', description: 'Collect vibration data from MPU-6050, compute FFT or threshold-based anomaly detection, stream to MQTT for industrial dashboard.' },
    // home-automation
    { title: 'Voice-Activated Smart Home Hub', components: JSON.stringify(['ESP32', 'I2S Microphone (INMP441)', 'Relay Modules x4', 'WiFi', 'MQTT Broker', 'Node-RED dashboard']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'advanced', category: 'home-automation', description: 'Capture voice commands via I2S mic, process with simple keyword detection, control relay-switched appliances via MQTT.' },
    // health
    { title: 'Wearable Fall Detection & Emergency Alert System', components: JSON.stringify(['ESP32', 'MPU-6050 Accelerometer', 'MAX30100 Pulse Sensor', 'WiFi', 'MQTT/HTTP Alert Endpoint']), simulatorUrl: 'https://wokwi.com/projects/new/esp32', hardwareOptional: true, difficultyLevel: 'advanced', category: 'health', description: 'Detect sudden acceleration changes (fall events) with MPU-6050, combine with pulse data, send emergency alert via WiFi.' },
  ];

  for (const bp of IOT_BLUEPRINTS) {
    const exists = await prisma.ioTProjectBlueprint.findFirst({ where: { title: bp.title } });
    if (!exists) await prisma.ioTProjectBlueprint.create({ data: bp });
  }
  console.log(`Seeded ${IOT_BLUEPRINTS.length} IoTProjectBlueprint records.`);

  // ── Seed OdooModuleScenario table ──────────────────────────────────────────
  // 18 curated module+business-type+process combinations.
  // Groq SELECTS one of these at enrollment time — it never invents a module.
  const ODOO_SCENARIOS = [
    // ── FOUNDATION difficulty ──
    { moduleName: 'Sales', businessType: 'wholesale food distributor', processFocus: 'order-to-cash', difficultyLevel: 'foundation', description: 'Configure sales orders, quotations, and customer invoicing for a wholesale distributor.' },
    { moduleName: 'Inventory', businessType: 'small retail clothing chain', processFocus: 'stock replenishment', difficultyLevel: 'foundation', description: 'Set up product categories, reorder rules, and basic inventory management for a retail chain.' },
    { moduleName: 'HR', businessType: 'IT services company', processFocus: 'employee onboarding', difficultyLevel: 'foundation', description: 'Configure employee records, department structure, and onboarding checklist for a small IT firm.' },
    { moduleName: 'POS', businessType: 'café franchise', processFocus: 'daily sales reconciliation', difficultyLevel: 'foundation', description: 'Set up Point of Sale for a café: products, payment methods, daily closing reports.' },
    { moduleName: 'Purchase', businessType: 'small construction materials supplier', processFocus: 'vendor management', difficultyLevel: 'foundation', description: 'Configure vendors, request-for-quotation workflow, and purchase orders for a building materials firm.' },
    { moduleName: 'Accounting', businessType: 'small professional services firm', processFocus: 'accounts-receivable cycle', difficultyLevel: 'foundation', description: 'Set up chart of accounts, customer invoicing, and payment tracking for a consulting or legal firm.' },

    // ── INTERMEDIATE difficulty ──
    { moduleName: 'Inventory', businessType: 'pharmaceutical wholesale distributor', processFocus: 'batch-tracking and expiry management', difficultyLevel: 'intermediate', description: 'Enable lot/serial number tracking, expiry date management, and FIFO valuation for pharma distribution.' },
    { moduleName: 'Sales', businessType: 'B2B auto-parts distributor', processFocus: 'multi-pricelist and discount management', difficultyLevel: 'intermediate', description: 'Configure customer-specific pricelists, discount rules, and sales team performance tracking.' },
    { moduleName: 'Manufacturing', businessType: 'small garment manufacturer', processFocus: 'bill-of-materials and work orders', difficultyLevel: 'intermediate', description: 'Define BOM for garments, create manufacturing orders, track work center operations and production output.' },
    { moduleName: 'HR', businessType: 'logistics and courier company', processFocus: 'attendance and payroll processing', difficultyLevel: 'intermediate', description: 'Configure attendance rules, leave types, payroll structures, and salary slip generation for a courier workforce.' },
    { moduleName: 'Accounting', businessType: 'mid-size FMCG company', processFocus: 'bank reconciliation and financial reporting', difficultyLevel: 'intermediate', description: 'Automate bank statement import, perform reconciliation, and generate P&L and balance sheet reports.' },
    { moduleName: 'Purchase', businessType: 'hospital and diagnostic centre', processFocus: 'purchase requisition and approval workflow', difficultyLevel: 'intermediate', description: 'Configure multi-level purchase approval, budget control per department, and vendor performance tracking.' },

    // ── ADVANCED difficulty ──
    { moduleName: 'Manufacturing', businessType: 'precision engineering workshop', processFocus: 'production planning and quality control', difficultyLevel: 'advanced', description: 'Advanced MRP: plan production runs, set up quality control checkpoints, manage scrap and rework workflows.' },
    { moduleName: 'Inventory', businessType: 'multi-warehouse e-commerce fulfillment centre', processFocus: 'multi-warehouse routing and dropshipping', difficultyLevel: 'advanced', description: 'Configure inter-warehouse routes, automated reordering, dropship routes, and cross-dock operations.' },
    { moduleName: 'Sales', businessType: 'SaaS subscription business', processFocus: 'recurring invoicing and subscription management', difficultyLevel: 'advanced', description: 'Set up Odoo subscriptions: recurring plans, upgrades/downgrades, prorated billing, and churn reporting.' },
    { moduleName: 'Accounting', businessType: 'import/export trading company', processFocus: 'multi-currency transactions and tax compliance', difficultyLevel: 'advanced', description: 'Configure multi-currency journals, automatic exchange rate updates, GST/VAT compliance, and inter-company transactions.' },
    { moduleName: 'HR', businessType: 'large BPO company', processFocus: 'performance appraisal and training management', difficultyLevel: 'advanced', description: 'Design appraisal cycles, skill gap analysis, training plans, and succession planning workflows for a large workforce.' },
    { moduleName: 'Manufacturing', businessType: 'food processing plant', processFocus: 'lot traceability and regulatory compliance', difficultyLevel: 'advanced', description: 'Full lot traceability from raw material to finished good, expiry management, and food safety audit trail generation.' },
  ];

  for (const sc of ODOO_SCENARIOS) {
    const exists = await prisma.odooModuleScenario.findFirst({ where: { moduleName: sc.moduleName, businessType: sc.businessType, processFocus: sc.processFocus } });
    if (!exists) await prisma.odooModuleScenario.create({ data: sc });
  }
  console.log(`Seeded ${ODOO_SCENARIOS.length} OdooModuleScenario records.`);

  // ── Seed ResourceLink table ────────────────────────────────────────────────
  // These are the real, verified URLs matched by Groq's resourceTags output.
  // Tags are short hyphenated strings that Groq will output (e.g. "customer-churn").
  // Each record should be re-verified periodically via the /api/cron/check-datasets endpoint.
  const RESOURCE_LINKS = [
    // ── AI/ML ───────────────────────────────────────────────────────────────
    { domainSlug: 'ai-ml', tags: JSON.stringify(['customer-churn', 'telecom', 'classification']), title: 'Telecom Customer Churn Dataset', url: 'https://www.kaggle.com/datasets/blastchar/telco-customer-churn', sourceType: 'kaggle', description: '7,043 rows; 21 features including contract type, monthly charges, tenure. Binary classification.' },
    { domainSlug: 'ai-ml', tags: JSON.stringify(['fraud-detection', 'imbalanced', 'credit-card']), title: 'Credit Card Fraud Detection', url: 'https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud', sourceType: 'kaggle', description: '284,807 transactions, 492 fraudulent. PCA-transformed features. Imbalanced dataset.' },
    { domainSlug: 'ai-ml', tags: JSON.stringify(['retail-timeseries', 'demand-forecasting', 'sales']), title: 'Store Item Demand Forecasting', url: 'https://www.kaggle.com/competitions/demand-forecasting-kernels-only/data', sourceType: 'kaggle', description: '5 years of daily sales data for 50 items across 10 stores.' },
    { domainSlug: 'ai-ml', tags: JSON.stringify(['medical', 'classification', 'healthcare']), title: 'Breast Cancer Wisconsin Diagnostic', url: 'https://archive.ics.uci.edu/dataset/17/breast+cancer+wisconsin+diagnostic', sourceType: 'uci', description: '569 instances, 30 numeric features from tumour measurements. Binary: malignant vs. benign.' },

    // ── LLM & Generative AI ─────────────────────────────────────────────────
    { domainSlug: 'llm-generative-ai', tags: JSON.stringify(['nlp', 'sentiment', 'text-classification']), title: 'IMDB Movie Reviews Sentiment', url: 'https://huggingface.co/datasets/stanfordnlp/imdb', sourceType: 'huggingface', description: '50,000 highly polar movie reviews for binary sentiment classification.' },
    { domainSlug: 'llm-generative-ai', tags: JSON.stringify(['llm', 'chatbot', 'rag', 'langchain']), title: 'LangChain RAG Quick Start Guide', url: 'https://python.langchain.com/docs/tutorials/rag/', sourceType: 'api-docs', description: 'Official LangChain RAG tutorial for building document-grounded LLM applications.' },
    { domainSlug: 'llm-generative-ai', tags: JSON.stringify(['vector-db', 'chromadb', 'embeddings']), title: 'ChromaDB Quickstart Guide', url: 'https://docs.trychroma.com/getting-started', sourceType: 'api-docs', description: 'Official ChromaDB documentation for vector storage and semantic search.' },

    // ── AI/ML & LLM Apps (legacy) ───────────────────────────────────────────
    { domainSlug: 'ai-ml-llm-apps', tags: JSON.stringify(['customer-churn', 'telecom', 'classification']), title: 'Telecom Customer Churn Dataset', url: 'https://www.kaggle.com/datasets/blastchar/telco-customer-churn', sourceType: 'kaggle', description: '7,043 rows; 21 features including contract type, monthly charges, tenure. Binary classification.' },
    { domainSlug: 'ai-ml-llm-apps', tags: JSON.stringify(['fraud-detection', 'imbalanced', 'credit-card']), title: 'Credit Card Fraud Detection', url: 'https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud', sourceType: 'kaggle', description: '284,807 transactions, 492 fraudulent. PCA-transformed features. Imbalanced dataset.' },
    { domainSlug: 'ai-ml-llm-apps', tags: JSON.stringify(['retail-timeseries', 'demand-forecasting', 'sales']), title: 'Store Item Demand Forecasting', url: 'https://www.kaggle.com/competitions/demand-forecasting-kernels-only/data', sourceType: 'kaggle', description: '5 years of daily sales data for 50 items across 10 stores.' },
    { domainSlug: 'ai-ml-llm-apps', tags: JSON.stringify(['nlp', 'sentiment', 'text-classification']), title: 'IMDB Movie Reviews Sentiment', url: 'https://huggingface.co/datasets/stanfordnlp/imdb', sourceType: 'huggingface', description: '50,000 highly polar movie reviews for binary sentiment classification.' },
    { domainSlug: 'ai-ml-llm-apps', tags: JSON.stringify(['recommendation', 'collaborative-filtering', 'ratings']), title: 'MovieLens 100K Dataset', url: 'https://grouplens.org/datasets/movielens/100k/', sourceType: 'other', description: '100,000 ratings from 943 users on 1,682 movies. Classic recommendation benchmark.' },
    { domainSlug: 'ai-ml-llm-apps', tags: JSON.stringify(['medical', 'classification', 'healthcare']), title: 'Breast Cancer Wisconsin Diagnostic', url: 'https://archive.ics.uci.edu/dataset/17/breast+cancer+wisconsin+diagnostic', sourceType: 'uci', description: '569 instances, 30 numeric features from tumour measurements. Binary: malignant vs. benign.' },
    { domainSlug: 'ai-ml-llm-apps', tags: JSON.stringify(['llm', 'chatbot', 'rag', 'langchain']), title: 'LangChain RAG Quick Start Guide', url: 'https://python.langchain.com/docs/tutorials/rag/', sourceType: 'api-docs', description: 'Official LangChain RAG tutorial for building document-grounded LLM applications.' },

    // ── Data Science ────────────────────────────────────────────────────────
    { domainSlug: 'data-science', tags: JSON.stringify(['customer-churn', 'telecom', 'classification']), title: 'Telecom Customer Churn Dataset', url: 'https://www.kaggle.com/datasets/blastchar/telco-customer-churn', sourceType: 'kaggle', description: '7,043 rows; 21 features. Binary churn classification benchmark.' },
    { domainSlug: 'data-science', tags: JSON.stringify(['housing', 'regression', 'real-estate']), title: 'House Prices Advanced Regression', url: 'https://www.kaggle.com/competitions/house-prices-advanced-regression-techniques/data', sourceType: 'kaggle', description: '1460 rows, 81 features covering lot size, condition, and neighborhood. Regression.' },
    { domainSlug: 'data-science', tags: JSON.stringify(['census', 'income', 'classification']), title: 'UCI Adult Census Income', url: 'https://archive.ics.uci.edu/dataset/2/adult', sourceType: 'uci', description: '48,842 instances. Predict whether income exceeds $50K/year from census attributes.' },
    { domainSlug: 'data-science', tags: JSON.stringify(['hospital', 'healthcare', 'readmission']), title: 'Diabetes 130-US Hospitals', url: 'https://archive.ics.uci.edu/dataset/296/diabetes+130-us+hospitals+for+years+1999-2008', sourceType: 'uci', description: '100,000 hospital admissions over 10 years. Predict 30-day readmission.' },
    { domainSlug: 'data-science', tags: JSON.stringify(['wine', 'quality', 'regression', 'classification']), title: 'UCI Wine Quality', url: 'https://archive.ics.uci.edu/dataset/186/wine+quality', sourceType: 'uci', description: '6,497 samples with 11 physicochemical input variables. Regression or multi-class.' },
    { domainSlug: 'data-science', tags: JSON.stringify(['ecommerce', 'retail-timeseries', 'sales']), title: 'Online Retail Transactions (UCI)', url: 'https://archive.ics.uci.edu/dataset/352/online+retail', sourceType: 'uci', description: '541,909 rows from a UK online retailer. RFM analysis and cohort study ready.' },

    // ── Data Analysis ────────────────────────────────────────────────────────
    { domainSlug: 'data-analysis', tags: JSON.stringify(['retail', 'dashboard', 'sales', 'profitability']), title: 'Superstore Sales Dataset', url: 'https://www.kaggle.com/datasets/vivek468/superstore-dataset-final', sourceType: 'kaggle', description: '9,994 retail transactions with region, category, profit, and discount. Good for dashboards.' },
    { domainSlug: 'data-analysis', tags: JSON.stringify(['hr', 'attrition', 'workforce']), title: 'IBM HR Analytics Employee Attrition', url: 'https://www.kaggle.com/datasets/pavansubhasht/ibm-hr-analytics-attrition-dataset', sourceType: 'kaggle', description: '1,470 employee records with attrition labels and 35 attributes. EDA and HR analytics.' },
    { domainSlug: 'data-analysis', tags: JSON.stringify(['flights', 'delays', 'transportation']), title: 'US Flight Delays 2015', url: 'https://www.kaggle.com/datasets/usdot/flight-delays', sourceType: 'kaggle', description: '5.8 million domestic flight records. Origin, destination, delay cause and duration.' },
    { domainSlug: 'data-analysis', tags: JSON.stringify(['ecommerce', 'customer-reviews', 'sentiment']), title: 'E-Commerce Product Reviews', url: 'https://www.kaggle.com/datasets/nicapotato/womens-ecommerce-clothing-reviews', sourceType: 'kaggle', description: '23,486 product reviews with star ratings, category, and free-text feedback.' },
    { domainSlug: 'data-analysis', tags: JSON.stringify(['covid', 'epidemiology', 'timeseries']), title: 'Our World in Data COVID-19 Dataset', url: 'https://github.com/owid/covid-19-data/blob/master/public/data/owid-covid-data.csv', sourceType: 'github-sample', description: 'Time-series data: cases, deaths, vaccinations by country and date.' },

    // ── IoT ──────────────────────────────────────────────────────────────────
    { domainSlug: 'iot', tags: JSON.stringify(['smart-home', 'sensor', 'timeseries']), title: 'IoT Sensor Data for Smart Home', url: 'https://www.kaggle.com/datasets/ranakrc/smart-home-system', sourceType: 'kaggle', description: 'Temperature, humidity, motion, luminosity readings. 200K+ records across 5 room types.' },
    { domainSlug: 'iot', tags: JSON.stringify(['air-quality', 'environmental', 'sensor']), title: 'UCI Air Quality Dataset', url: 'https://archive.ics.uci.edu/dataset/360/air+quality', sourceType: 'uci', description: 'Hourly air quality sensor data from an Italian city. CO, NOx, benzene concentrations.' },
    { domainSlug: 'iot', tags: JSON.stringify(['esp32', 'microcontroller', 'hardware-docs']), title: 'ESP32 Getting Started Guide', url: 'https://docs.espressif.com/projects/esp-idf/en/stable/esp32/get-started/', sourceType: 'hardware-datasheet', description: 'Official Espressif ESP32 programming guide for IoT device setup and sensor integration.' },
    { domainSlug: 'iot', tags: JSON.stringify(['raspberry-pi', 'gpio', 'hardware-docs']), title: 'Raspberry Pi GPIO Documentation', url: 'https://www.raspberrypi.com/documentation/computers/raspberry-pi.html', sourceType: 'hardware-datasheet', description: 'Official Raspberry Pi hardware documentation for GPIO, sensors, and peripheral interfacing.' },
    { domainSlug: 'iot', tags: JSON.stringify(['iot-simulator', 'wokwi', 'arduino']), title: 'Wokwi Online IoT Simulator', url: 'https://wokwi.com/', sourceType: 'other', description: 'Free browser-based simulator for Arduino, ESP32, and Raspberry Pi projects.' },

    // ── ERP (Odoo) ────────────────────────────────────────────────────────────
    { domainSlug: 'erp-odoo', tags: JSON.stringify(['odoo-inventory', 'stock', 'warehouse']), title: 'Odoo Inventory Management Docs', url: 'https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory.html', sourceType: 'api-docs', description: 'Official Odoo 17 docs: inventory moves, warehouses, routes, and replenishment rules.' },
    { domainSlug: 'erp-odoo', tags: JSON.stringify(['odoo-sales', 'crm', 'quotation']), title: 'Odoo Sales & CRM Docs', url: 'https://www.odoo.com/documentation/17.0/applications/sales/sales.html', sourceType: 'api-docs', description: 'Odoo 17 Sales module: quotations, orders, pricelists, and customer portal.' },
    { domainSlug: 'erp-odoo', tags: JSON.stringify(['odoo-accounting', 'invoicing', 'finance']), title: 'Odoo Accounting & Finance Docs', url: 'https://www.odoo.com/documentation/17.0/applications/finance/accounting.html', sourceType: 'api-docs', description: 'Odoo 17 Accounting: invoices, journals, reconciliation, and financial reports.' },
    { domainSlug: 'erp-odoo', tags: JSON.stringify(['odoo-purchase', 'vendor', 'procurement']), title: 'Odoo Purchase Module Docs', url: 'https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/purchase.html', sourceType: 'api-docs', description: 'Odoo 17 Purchase: vendor management, purchase orders, receipts, and RFQs.' },
    { domainSlug: 'erp-odoo', tags: JSON.stringify(['odoo-manufacturing', 'mrp', 'production']), title: 'Odoo Manufacturing (MRP) Docs', url: 'https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/manufacturing.html', sourceType: 'api-docs', description: 'Odoo 17 MRP: bills of materials, work orders, production planning, and quality control.' },
    { domainSlug: 'erp-odoo', tags: JSON.stringify(['northwind', 'erp-data', 'sql']), title: 'Northwind Traders SQL Dataset', url: 'https://github.com/microsoft/sql-server-samples/tree/master/samples/databases/northwind-pubs', sourceType: 'github-sample', description: 'Classic relational business database: customers, orders, products, suppliers for ERP exercises.' },

    // ── Data Engineering ─────────────────────────────────────────────────────
    { domainSlug: 'data-engineering', tags: JSON.stringify(['taxi', 'parquet', 'etl', 'pipeline']), title: 'NYC Taxi Trip Data (Parquet)', url: 'https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page', sourceType: 'other', description: 'Multi-million row taxi trip records in Parquet. Ideal for ETL pipelines and partitioning.' },
    { domainSlug: 'data-engineering', tags: JSON.stringify(['json-ingestion', 'reviews', 'nlp']), title: 'Yelp Open Dataset', url: 'https://www.yelp.com/dataset', sourceType: 'other', description: '6.7M reviews, 192K businesses in JSON. Useful for JSON ingestion pipelines and large-scale ETL.' },
    { domainSlug: 'data-engineering', tags: JSON.stringify(['streaming', 'kafka', 'pubsub']), title: 'Apache Kafka Quickstart', url: 'https://kafka.apache.org/quickstart', sourceType: 'api-docs', description: 'Official Kafka quickstart guide for event streaming pipelines.' },
    { domainSlug: 'data-engineering', tags: JSON.stringify(['airflow', 'orchestration', 'dag']), title: 'Apache Airflow Documentation', url: 'https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html', sourceType: 'api-docs', description: 'Airflow tutorial for building and scheduling data pipeline DAGs.' },
    { domainSlug: 'data-engineering', tags: JSON.stringify(['dbt', 'data-warehouse', 'transformation']), title: 'dbt Getting Started Guide', url: 'https://docs.getdbt.com/docs/introduction', sourceType: 'api-docs', description: 'dbt introduction and quickstart for data warehouse transformation.' },
    { domainSlug: 'data-engineering', tags: JSON.stringify(['public-api', 'rest', 'ingestion']), title: 'OpenWeatherMap API Docs', url: 'https://openweathermap.org/api', sourceType: 'api-docs', description: 'RESTful weather data API — good for real-time ingestion pipeline projects.' },

    // ── Full Stack Java ───────────────────────────────────────────────────────
    { domainSlug: 'fullstack-java', tags: JSON.stringify(['spring-boot', 'rest-api', 'backend']), title: 'Spring Boot Getting Started', url: 'https://spring.io/guides/gs/spring-boot/', sourceType: 'api-docs', description: 'Official Spring Boot guide for building REST APIs with Java.' },
    { domainSlug: 'fullstack-java', tags: JSON.stringify(['jpa', 'hibernate', 'database']), title: 'Spring Data JPA Reference', url: 'https://docs.spring.io/spring-data/jpa/docs/current/reference/html/', sourceType: 'api-docs', description: 'Spring Data JPA documentation for entity management and repository patterns.' },
    { domainSlug: 'fullstack-java', tags: JSON.stringify(['northwind', 'relational-data', 'sql']), title: 'Northwind Traders SQL Dataset', url: 'https://github.com/microsoft/sql-server-samples/tree/master/samples/databases/northwind-pubs', sourceType: 'github-sample', description: 'Classic business dataset for building CRUD APIs and backend data models.' },
    { domainSlug: 'fullstack-java', tags: JSON.stringify(['ecommerce', 'retail-data', 'transactions']), title: 'Online Retail Transactions (UCI)', url: 'https://archive.ics.uci.edu/dataset/352/online+retail', sourceType: 'uci', description: '541,909 rows from a UK online retailer. Drive full-stack inventory and order management features.' },
    { domainSlug: 'fullstack-java', tags: JSON.stringify(['jwt', 'security', 'authentication']), title: 'Spring Security + JWT Tutorial', url: 'https://www.baeldung.com/spring-security-oauth-jwt', sourceType: 'api-docs', description: 'Step-by-step Baeldung guide for JWT-based security in Spring Boot applications.' },

    // ── Full Stack Python ─────────────────────────────────────────────────────
    { domainSlug: 'fullstack-python', tags: JSON.stringify(['fastapi', 'rest-api', 'backend']), title: 'FastAPI Tutorial', url: 'https://fastapi.tiangolo.com/tutorial/', sourceType: 'api-docs', description: 'Official FastAPI tutorial for building REST APIs with Python.' },
    { domainSlug: 'fullstack-python', tags: JSON.stringify(['django', 'full-stack', 'web']), title: 'Django Getting Started', url: 'https://docs.djangoproject.com/en/stable/intro/tutorial01/', sourceType: 'api-docs', description: 'Official Django tutorial for building full-stack Python web applications.' },
    { domainSlug: 'fullstack-python', tags: JSON.stringify(['ecommerce', 'retail-data', 'transactions']), title: 'Online Retail Transactions (UCI)', url: 'https://archive.ics.uci.edu/dataset/352/online+retail', sourceType: 'uci', description: '541,909 rows from a UK online retailer. Build product, order, and customer APIs.' },
    { domainSlug: 'fullstack-python', tags: JSON.stringify(['sqlalchemy', 'database', 'orm']), title: 'SQLAlchemy ORM Tutorial', url: 'https://docs.sqlalchemy.org/en/20/orm/quickstart.html', sourceType: 'api-docs', description: 'SQLAlchemy 2.0 ORM quickstart for Python database-backed applications.' },
    { domainSlug: 'fullstack-python', tags: JSON.stringify(['public-api', 'rest', 'third-party']), title: 'Public APIs List (GitHub)', url: 'https://github.com/public-apis/public-apis', sourceType: 'github-sample', description: 'Curated list of free public APIs for building integration and data features.' },
  ];

  for (const rl of RESOURCE_LINKS) {
    const exists = await prisma.resourceLink.findFirst({ where: { title: rl.title, domainSlug: rl.domainSlug } });
    if (!exists) {
      await prisma.resourceLink.create({ data: rl });
    }
  }
  console.log(`Seeded ${RESOURCE_LINKS.length} ResourceLink records.`);

  console.log(`\nSeeded ${DOMAINS.length} domains, ${DOMAINS.length * DURATIONS.length} published tracks.`);
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
  console.log(`Test student login: ${testStudentEmail} / password123`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

