# Autonomous Hydrographic Survey USV — Architecture & Flow Diagrams

> Companion system architecture, mission state-machine, CUDA multibeam bathymetry, and COLREGs safety diagrams for **[hydro-usv-ros2](https://github.com/indian-aman/hydro-usv-ros2)**.

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph Shore["OPERATOR STATION (Shore)"]
        OP[Mission Planning<br/>Real-time Monitoring<br/>Data Visualization<br/>Emergency Control]
    end
  
    subgraph Comm["COMMUNICATION"]
        Radio[Radio Link<br/>15-20km]
        Cell[Cellular 4G/LTE<br/>Backup]
    end
  
    subgraph USV["USV ONBOARD SYSTEMS"]
        subgraph Sensors["SENSORS"]
            NavSens[Navigation:<br/>GPS-RTK, IMU, Compass, DVL]
            HydroSens[Hydrographic:<br/>MBES, SBES, MRU, SVP]
            SafetySens[Safety:<br/>LiDAR, Camera, Radar, AIS]
        end
    
        subgraph Processing["PROCESSING (3-Tier)"]
            Tier1[TIER 1: MOOS-IVP<br/>Mission Management]
            Tier2[TIER 2: ROS2<br/>Navigation & Control]
            Tier3[TIER 3: CUDA<br/>Acceleration]
        end
    
        Control[CONTROL & ACTUATION<br/>Thrusters, Power, Data Storage]
    end
  
    OP --> Radio
    OP --> Cell
    Radio --> Tier1
    Cell --> Tier1
    NavSens --> Tier1
    HydroSens --> Tier1
    SafetySens --> Tier1
    Tier1 --> Tier2
    Tier2 --> Tier3
    Tier3 --> Control
  
    style Shore fill:#d5e8d4
    style Comm fill:#fff2cc
    style USV fill:#e1d5e7
    style Sensors fill:#dae8fc
    style Processing fill:#f8cecc
    style Control fill:#d5e8d4
```

---

## 2. Mission Execution Flow

```mermaid
flowchart TD
    Start([MISSION START]) --> Check{"System<br/>Checks<br/>OK?"}
    Check -->|NO| Abort[ABORT MISSION]
    Check -->|YES| Deploy[DEPLOY = TRUE]
    Deploy --> Transit[Transit to Area]
    Transit --> Arrived{"Arrived?"}
    Arrived -->|YES| Survey[SURVEY MODE]
  
    Survey --> ObsCheck{"Obstacle?"}
    ObsCheck -->|YES| Avoid[Avoid Obstacle]
    Avoid --> SurveyComplete
  
    Survey --> BattCheck{"Battery<br/>&lt;20%?"}
    BattCheck -->|YES| RTB1[Return to Base]
  
    Survey --> QualCheck{"Poor<br/>Quality?"}
    QualCheck -->|YES| Slow[Slow Down<br/>Resurvey]
    Slow --> SurveyComplete
  
    Survey --> SurveyComplete{"Survey<br/>Complete?"}
    SurveyComplete -->|NO| Survey
    SurveyComplete -->|YES| Coverage{"Coverage<br/>&gt;90%?"}
  
    Coverage -->|NO| Resurvey[Resurvey Gaps]
    Resurvey --> Survey
    Coverage -->|YES| RTB2[RETURN TO BASE]
    RTB2 --> NavHome[Navigate Home]
    NavHome --> Home{"Arrived<br/>Home?"}
    Home -->|YES| Station[Station Keep]
    Station --> MissionEnd([MISSION END])
  
    style Start fill:#d5e8d4
    style Deploy fill:#d5e8d4
    style Survey fill:#e1d5e7
    style RTB2 fill:#d5e8d4
    style MissionEnd fill:#f8cecc
    style Abort fill:#f8cecc
```

---

## 3. Bathymetric Processing Pipeline

```mermaid
flowchart TD
    MBES[MULTIBEAM SONAR<br/>512 beams at 5 Hz] --> Raw[Raw Beam Data<br/>Range, Angle, Intensity]
  
    Raw --> Step1[Step 1: Beam Forming<br/>CUDA Accelerated]
    Step1 --> Beams[Beam Vectors]
  
    MRU[MRU<br/>Motion Data] --> Step2
    Beams --> Step2[Step 2: Motion Compensation<br/>CUDA Kernel]
    Step2 --> Corrected[Corrected Beams]
  
    SVP[SVP<br/>Sound Velocity] --> Step3
    Corrected --> Step3[Step 3: SVP Correction<br/>CUDA Ray Tracing]
    Step3 --> Refracted[Refraction Corrected]
  
    POS[Position<br/>From EKF] --> Step4
    Refracted --> Step4[Step 4: Georeferencing]
    Step4 --> Georef[Georeferenced Points<br/>X, Y, Depth]
  
    Georef --> Step5[Step 5: Outlier Filter<br/>CUDA Statistical]
    Step5 --> Clean[Clean Points]
  
    Clean --> Out1[Real-Time Path<br/>for Display]
    Clean --> Out2[Real-Time Grid<br/>CUDA CUBE]
    Clean --> Out3[DAS Logger<br/>Storage]
  
    Out2 --> QC[Quality Check<br/>Coverage, Density, IHO]
    QC --> QOK{"Quality<br/>OK?"}
    QOK -->|YES| Continue[Continue Survey]
    QOK -->|NO| Flag[Flag for Resurvey]
  
    style MBES fill:#dae8fc
    style Step1 fill:#ffe6cc
    style Step2 fill:#ffe6cc
    style Step3 fill:#ffe6cc
    style Step4 fill:#ffe6cc
    style Step5 fill:#ffe6cc
    style Clean fill:#d5e8d4
    style Out1 fill:#d5e8d4
    style Out2 fill:#d5e8d4
    style Out3 fill:#d5e8d4
    style Continue fill:#d5e8d4
    style Flag fill:#f8cecc
```

---

## 4. Sensor Fusion & Localization

```mermaid
flowchart TD
    GPS[GPS-RTK<br/>10 Hz] --> Transform
    IMU[IMU<br/>100 Hz] --> Transform
    Compass[Compass<br/>20 Hz] --> Transform
    DVL[DVL<br/>5 Hz] --> Transform
  
    Transform[Coordinate Transform<br/>Lat/Lon -> UTM<br/>Body -> World Frame] --> EKF
  
    EKF[Extended Kalman Filter<br/>robot_localization<br/><br/>State Vector 15D:<br/>Position, Orientation<br/>Velocities, Accelerations]
  
    EKF --> Output[Fused State at 50 Hz<br/>/odometry/filtered<br/>/tf odom -> base]
  
    Output --> Nav[Navigation<br/>Nav2]
    Output --> Bathy[Bathymetry<br/>Processing]
    Output --> Comm[Communication<br/>Telemetry]
  
    style GPS fill:#dae8fc
    style IMU fill:#dae8fc
    style Compass fill:#dae8fc
    style DVL fill:#dae8fc
    style EKF fill:#ffe6cc
    style Output fill:#d5e8d4
    style Nav fill:#e1d5e7
    style Bathy fill:#e1d5e7
    style Comm fill:#e1d5e7
```

---

## 5. Obstacle Detection & Avoidance

```mermaid
flowchart TD
    LiDAR[LiDAR<br/>0-100m] --> Fusion
    Camera[Camera<br/>0-500m] --> Vision[CUDA YOLOv8<br/>Object Detection]
    Vision --> Fusion
    Radar[Radar<br/>0-5000m] --> Fusion
    AIS[AIS<br/>0-20km] --> Fusion
  
    Fusion[Multi-Sensor Fusion<br/>Combine & Track Objects] --> ObsList[Obstacle List<br/>Position, Velocity<br/>Size, Type]
  
    ObsList --> Risk[Collision Risk Analysis<br/>Calculate CPA/TCPA<br/>Assess Risk]
  
    Risk --> Level{"Risk<br/>Level?"}
  
    Level -->|LOW| Monitor[Monitor Only<br/>No Action]
    Level -->|HIGH| COLREGS[COLREGS Analysis<br/>Head-on? Crossing?<br/>Give Way? Stand On?]
  
    COLREGS --> Plan[Generate<br/>Avoidance Path]
    Plan --> MOOS[Send to MOOS-IVP<br/>BHV_AvoidObstacle<br/>Priority: 200]
    MOOS --> Execute[Execute Avoidance<br/>Slow Down, Alter Course<br/>Monitor Clearance]
    Execute --> Resume[Return to Survey<br/>Resume Data Collection]
  
    style LiDAR fill:#dae8fc
    style Camera fill:#dae8fc
    style Radar fill:#dae8fc
    style AIS fill:#dae8fc
    style Vision fill:#ffe6cc
    style Fusion fill:#fff2cc
    style COLREGS fill:#ffe6cc
    style Execute fill:#d5e8d4
    style Resume fill:#d5e8d4
```

---

## 6. Power Management

```mermaid
flowchart TD
    Battery[BATTERY SYSTEM<br/>Lithium-Ion 10 kWh<br/>48V Nominal] --> BMS
  
    BMS[Battery Management System<br/>Monitor: Voltage, Current<br/>Temperature, SoC, SoH] --> Dist[Power Distribution]
  
    Dist --> High[High Power<br/>Thrusters 2x500W<br/>Total: 1100W]
    Dist --> Med[Medium Power<br/>Computer 100W<br/>MBES 50W<br/>LiDAR 20W<br/>Total: 170W]
    Dist --> Low[Low Power<br/>GPS 5W<br/>IMU 2W<br/>Radio 10W<br/>Total: 17W]
  
    High --> Monitor
    Med --> Monitor
    Low --> Monitor
  
    Monitor[Power Monitor<br/>Total Draw<br/>Remaining Capacity<br/>Estimated Runtime] --> Energy[Energy Management<br/>Algorithm]
  
    Energy --> Check{"Battery<br/>Level?"}
  
    Check -->|">60%"| Normal[NORMAL MODE<br/>All Systems ON<br/>Full Speed]
    Check -->|"40-60%"| Economy[ECONOMY MODE<br/>Reduce Speed<br/>Lower Refresh Rates]
    Check -->|"20-40%"| LowPower[LOW POWER MODE<br/>Slow Down<br/>Disable MBES<br/>SBES Only]
    Check -->|"<20%"| Critical[CRITICAL MODE<br/>Abort Mission<br/>Return to Base<br/>Minimum Power]
  
    style Battery fill:#fff2cc
    style BMS fill:#ffe6cc
    style Normal fill:#d5e8d4
    style Economy fill:#fff2cc
    style LowPower fill:#ffe6cc
    style Critical fill:#f8cecc
```

---

## 7. Communication & Telemetry

```mermaid
flowchart TD
    subgraph USV["USV ONBOARD"]
        High[High Priority<br/>Commands, E-Stop<br/>Waypoints<br/>As needed, Reliable]
        Med[Medium Priority<br/>Position, Battery<br/>Sensor Status<br/>1 Hz, Reliable]
        Low[Low Priority<br/>Raw Data, Logs<br/>Full Bathymetry<br/>On Request, Best Effort]
    
        High --> Format
        Med --> Format
        Low --> Format
    
        Format[Message Formatter<br/>MAVLink/Custom<br/>Serialize, Timestamp<br/>Checksum, Compress] --> LinkMgr
    
        LinkMgr[Link Manager<br/>Monitor Quality<br/>Select Best Link]
    end
  
    LinkMgr --> Radio[Radio Link<br/>Primary<br/>15-20km<br/>Low Latency<br/>100kbps-10Mbps]
    LinkMgr --> Cell[Cellular Link<br/>Backup<br/>Coverage Dependent<br/>Higher Latency<br/>1-100Mbps]
  
    subgraph Shore["OPERATOR STATION"]
        Mission[Mission Control<br/>Status, Alerts, Logs]
        Display[Data Display<br/>Live Map, Sensors<br/>Bathymetry, Coverage]
        Manual[Manual Control<br/>Joystick, Commands<br/>Override]
    end

    Radio --> Shore
    Cell --> Shore
  
    LinkMgr --> FailCheck{"Link<br/>Quality?"}
    FailCheck -->|Good| Normal2[Normal Operation<br/>Full Telemetry]
    FailCheck -->|Poor| Degraded[Degraded Mode<br/>Essential Only<br/>Buffer Data]
    FailCheck -->|Lost| Auto[Autonomous Mode<br/>Options:<br/>1. Continue if safe<br/>2. Station Keep<br/>3. Return to Base]
  
    style USV fill:#e1d5e7
    style Shore fill:#d5e8d4
    style High fill:#f8cecc
    style Med fill:#fff2cc
    style Low fill:#dae8fc
    style Radio fill:#ffe6cc
    style Cell fill:#ffe6cc
    style Normal2 fill:#d5e8d4
    style Degraded fill:#fff2cc
    style Auto fill:#ffe6cc
```

---

## 8. Safety & Emergency Procedures

```mermaid
flowchart TD
    subgraph Monitors["Safety Monitors (Always Active)"]
        Geo[Geofence Monitor<br/>Boundary, Depth, Traffic]
        Health[System Health Monitor<br/>Sensors, Compute, Battery, Comms]
        Env[Environmental Monitor<br/>Waves, Wind, Visibility, Current]
    end
  
    Monitors --> Assess[Safety Assessment]
  
    Assess --> Severity{"Severity?"}
  
    Severity -->|OK| Continue[Continue Normal Operations]
  
    Severity -->|WARNING| Warn[Log & Continue<br/>Record Event<br/>Alert Operator<br/>Monitor Closely]
  
    Severity -->|ERROR| Degrade[Degraded Mode<br/>Reduce Speed<br/>Disable Non-Critical<br/>Alert Operator]
  
    Severity -->|CRITICAL| Emergency[EMERGENCY MODE<br/>Stop Mission<br/>Assess Situation]
  
    Emergency --> Type{"Emergency<br/>Type?"}
  
    Type --> Collision[Collision Imminent<br/><br/>EMERGENCY STOP<br/>1. Stop Motors<br/>2. Drop Anchor<br/>3. All Stop<br/>4. Activate Beacon<br/>5. Wait for Rescue]
  
    Type --> CommBatt[Lost Comms<br/>+ Low Battery<br/><br/>RETURN TO BASE<br/>1. Calculate Fastest Route<br/>2. Maximum Speed<br/>3. Broadcast Return<br/>4. Monitor Progress]
  
    Type --> SysFail[System Failure<br/><br/>STATION KEEP<br/>1. Hold Position<br/>2. Minimal Power<br/>3. Activate Distress<br/>4. Wait for Rescue]
  
    style Monitors fill:#dae8fc
    style Continue fill:#d5e8d4
    style Warn fill:#fff2cc
    style Degrade fill:#ffe6cc
    style Emergency fill:#f8cecc
    style Collision fill:#f8cecc
    style CommBatt fill:#ffe6cc
    style SysFail fill:#ffe6cc
```
