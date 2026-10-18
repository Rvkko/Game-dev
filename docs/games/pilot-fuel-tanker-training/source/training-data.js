/* Auto-generated training content for the Pilot Fuel Tanker Training Prototype.
   Source: multi-agent content workflow (10 modules + assessment), reviewed by an audit agent.
   Educational prototype only — see DISCLAIMER. */
window.TRAINING = {
  META: {
  "version": "1.0.0-prototype",
  "updated": "2026-07-06",
  "passThreshold": 0.8,
  "statuses": [
    "Prototype",
    "SME Review Needed",
    "Legal Review Needed",
    "Pilot Approval Needed",
    "Ready for Internal Pilot Test"
  ],
  "defaultStatus": "Prototype"
},
  DISCLAIMER: "Educational visualization prototype only. Not official Pilot training. Not DOT/FMCSA/PHMSA training. Not hazmat operating instruction. Real work must follow company procedures, federal/state regulations, site rules, and certified training.",
  PART_LABELS: {
  "hood": "Hood",
  "grille": "Grille",
  "headlights": "Headlights",
  "foglights": "Fog / Marker Lights",
  "roofMarkers": "Roof Marker Lights",
  "mirrors": "Mirrors",
  "windshield": "Windshield & Wipers",
  "doorL": "Driver Door",
  "doorR": "Passenger Door",
  "steps": "Cab Steps",
  "grabHandles": "Grab Handles",
  "sleeper": "Sleeper Berth",
  "exhaust": "Exhaust Stack",
  "frame": "Chassis / Frame",
  "sunVisor": "Sun Visor",
  "airHorns": "Air Horns",
  "antennas": "CB Antennas",
  "plate": "License Plate",
  "engine": "Engine Block",
  "radiator": "Radiator",
  "fan": "Cooling Fan",
  "belts": "Belts & Hoses",
  "airfilter": "Air Intake / Filter",
  "coolant": "Coolant Reservoir",
  "batteries": "Battery Box",
  "oilCheck": "Oil / Fluid Check Points",
  "engLabel": "Engine Warning Labels",
  "pistons": "Pistons & Crankshaft",
  "oilPan": "Oil Pan & Oil System",
  "wiring": "Wiring Harness",
  "turbo": "Turbocharger",
  "firewall": "Firewall",
  "fuelTanks": "Tractor Fuel Tanks",
  "defTank": "DEF Tank",
  "dash": "Dashboard",
  "steeringWheel": "Steering Wheel",
  "seat": "Air-Ride Seat",
  "gauges": "Gauge Cluster",
  "switches": "Switch Panel",
  "radio": "CB / Radio Panel",
  "logbook": "Logbook / ELD",
  "extinguisher": "Fire Extinguisher",
  "pedals": "Pedals",
  "gearSelector": "Gear Selector",
  "parkingBrake": "Parking Brake Valves",
  "gloveBox": "Glove Box / Documents",
  "sleeperBed": "Sleeper Bunk",
  "fifthWheel": "Fifth Wheel",
  "kingpin": "Kingpin & Coupling",
  "airLines": "Air & Electrical Lines",
  "tankShell": "Tanker Shell",
  "frontCap": "Front Head (Cap)",
  "rearCap": "Rear Head (Cap)",
  "tankFrame": "Tanker Frame & Saddles",
  "catwalk": "Top Catwalk",
  "hatch": "Manholes / Top Hatches",
  "vaporRecovery": "Vapor Recovery",
  "sidePiping": "Side Piping",
  "valves": "Product Valves / Manifold",
  "hose": "Fuel Delivery Hose",
  "hoseTubes": "Hose Storage Tubes",
  "emergencyShutoff": "Emergency Shutoff",
  "ladder": "Rear Ladder",
  "rearBumper": "Rear Bumper (Underride Guard)",
  "compartments": "Internal Compartments",
  "baffles": "Surge Baffles",
  "spillKit": "Spill Kit",
  "wheelsTractor": "Tractor Tires & Wheels",
  "mudflapsTractor": "Mud Flaps",
  "wheelsTrailer": "Trailer Tires, Axles & Suspension",
  "mudflapsTrailer": "Trailer Mud Flaps",
  "rearLights": "Rear Lights",
  "sideMarkers": "Side Marker Lights",
  "reflectiveTape": "Reflective Conspicuity Tape",
  "landingGear": "Landing Gear",
  "placard": "Hazmat Placards",
  "port": "Underground Tank Fill Port",
  "pump": "Fuel Dispenser",
  "cones": "Safety Cones",
  "chocks": "Wheel Chocks",
  "sign": "Travel Center Sign",
  "flag": "Travel Center Flag",
  "dancer": "Sky Dancer"
},
  MODULES: [
  {
    "id": "m1",
    "number": 1,
    "title": "Truck Overview",
    "objective": "Identify the major sections of a gasoline tractor-trailer and understand how the tractor connects to the tanker.",
    "duration": "4 min",
    "explorerAction": "normal",
    "highlightParts": [
      "hood",
      "sleeper",
      "fifthWheel",
      "kingpin",
      "tankShell",
      "compartments"
    ],
    "sections": [
      {
        "heading": "Two machines, one rig",
        "body": "A fuel-hauling rig is really two units. The tractor is the powered front half: the hood covers the engine, the cab holds the driver, and the sleeper gives the driver a place to rest on long hauls. Behind it rides the trailer, which carries the load. The tractor supplies the pulling power, the braking air, and the electrical signals; the trailer just follows. Learning to see the rig as tractor-plus-trailer, not one long truck, makes everything else easier to understand."
      },
      {
        "heading": "How they connect",
        "body": "The two halves lock together at the coupling. A round plate on the tractor frame called the fifthWheel accepts the kingpin, a steel pin hanging under the front of the trailer. When the tractor backs under the trailer, the fifthWheel jaws snap shut around the kingpin, forming a hinge the whole rig pivots on. This single connection carries the trailer's front weight and lets the rig bend through turns. It is the most important mechanical link on the vehicle."
      },
      {
        "heading": "What makes it a fuel tanker",
        "body": "A box trailer is a rectangular container for dry freight. A gasoline tanker is different: the tankShell is a cylindrical pressure vessel built to hold liquid fuel safely. Inside, it is split into separate compartments so different fuel grades can be hauled at once and so the load stays balanced. The rounded shape, the low center of gravity, and the internal divisions all exist because moving thousands of gallons of flammable liquid demands a very different structure than hauling boxes."
      }
    ],
    "task": {
      "instruction": "Use the normal solid view to orbit the whole rig. Find the powered tractor up front and the tanker trailer behind it, then look underneath where they join at the fifth wheel and kingpin.",
      "type": "explore",
      "targetParts": [
        "hood",
        "sleeper",
        "fifthWheel",
        "kingpin",
        "tankShell"
      ]
    },
    "checkpoint": {
      "question": "What connects the tractor to the tanker trailer?",
      "options": [
        "The fifth wheel locking onto the kingpin",
        "The catwalk bolted to the hood",
        "The air horns clamped to the frame",
        "The mudflaps hooked to the tank shell"
      ],
      "answerIndex": 0,
      "explanation": "The tractor's fifth wheel plate closes its jaws around the trailer's kingpin, forming the pivoting hinge that couples the two units and carries the trailer's front weight."
    }
  },
  {
    "id": "m2",
    "number": 2,
    "title": "Tractor Cab & Driver Controls",
    "objective": "Locate the primary driver controls and in-cab safety equipment inside the tractor cab.",
    "duration": "5 min",
    "explorerAction": "cab",
    "highlightParts": [
      "seat",
      "steeringWheel",
      "pedals",
      "gauges",
      "parkingBrake",
      "radio",
      "logbook",
      "extinguisher"
    ],
    "sections": [
      {
        "heading": "The Driver's Station",
        "body": "The seat, steeringWheel, and pedals form the core driving position. An air-ride seat cushions the driver over long hauls and must be adjusted so the pedals and wheel sit within easy reach. The pedals follow the standard layout: clutch, brake, and throttle. Getting seated and squared up before anything else is what lets a driver stay in control of a heavy, loaded rig."
      },
      {
        "heading": "Reading the Gauges",
        "body": "The gauges cluster tells the driver the health of the truck at a glance: engine speed, road speed, coolant temperature, oil pressure, and the two air-pressure needles for the brake system. On a tanker, watching air pressure matters because the brakes depend on it. A low-air warning is a signal to stop and address the problem, not to keep rolling."
      },
      {
        "heading": "Parking Brake Controls",
        "body": "The parkingBrake valves are the yellow and red push-pull knobs on the dash. The yellow diamond sets the tractor parking brakes; the red octagon controls the trailer air supply. Setting the parking brake is essential before coupling, uncoupling, or leaving the cab. On a loaded fuel tanker parked at a rack, a properly set brake is a basic line of defense against roll-away."
      },
      {
        "heading": "In-Cab Safety & Records",
        "body": "The extinguisher is mounted within the driver's reach for fast access, and its charge and mounting should be confirmed. The logbook represents hours-of-service records, today usually an electronic logging device (ELD). Seat belts anchor the driver in place. These items are about awareness of where safety equipment lives, not a substitute for formal certification."
      }
    ],
    "task": {
      "instruction": "Enter the cab x-ray view and click each control in turn: find the steeringWheel, the pedals below it, the gauges cluster ahead of the wheel, and the parkingBrake knobs on the dash. Then locate the extinguisher and confirm you can reach it from the seat.",
      "type": "inspect",
      "targetParts": [
        "steeringWheel",
        "pedals",
        "gauges",
        "parkingBrake",
        "extinguisher",
        "seat"
      ]
    },
    "checkpoint": {
      "question": "On the dashboard, which parking brake control sets the tractor's own parking brakes?",
      "options": [
        "The red octagon knob",
        "The yellow diamond knob",
        "The clutch pedal",
        "The coolant temperature gauge"
      ],
      "answerIndex": 1,
      "explanation": "The yellow diamond push-pull knob sets the tractor parking brakes, while the red octagon controls the trailer air supply. Both live in the parkingBrake control group on the dash."
    },
    "safetyNote": "This module is awareness and familiarization only. It is an educational prototype, not official Pilot, DOT, FMCSA, or PHMSA training, and does not authorize operating a commercial vehicle or handling fuel."
  },
  {
    "id": "m3",
    "number": 3,
    "title": "Engine Bay & Fluids",
    "objective": "Recognize the main engine systems and the fluids that keep them running.",
    "duration": "6 min",
    "explorerAction": "engine",
    "highlightParts": [
      "engine",
      "radiator",
      "fan",
      "belts",
      "airfilter",
      "turbo",
      "batteries",
      "oilCheck",
      "coolant",
      "defTank",
      "fuelTanks",
      "oilPan"
    ],
    "sections": [
      {
        "heading": "The heart of the truck",
        "body": "Tilt the hood forward and you are looking at a heavy-duty inline-6 diesel engine, typically 400 to 500 horsepower. That is what moves 80,000 pounds of loaded truck and trailer. The engine block is the big cast metal core; the oil pan is the sump underneath it holding the oil supply. Everything else in the bay exists to feed this engine air, fuel, and cooling, or to carry away its heat and exhaust."
      },
      {
        "heading": "Keeping it cool",
        "body": "A working diesel makes enormous heat. The radiator is the large cooling core at the front of the bay, and the cooling fan sits right behind it, pulling air through when the truck is moving slowly. The coolant reservoir is the translucent overflow bottle that shows fluid level at a glance. Belts and hoses drive and connect these parts. A cracked belt or a soft, bulging hose is a breakdown waiting to happen."
      },
      {
        "heading": "Air, boost, and power",
        "body": "The air intake and filter feed the engine clean air, and a diesel this size swallows huge volumes of it. The turbocharger is an exhaust-driven turbine that force-feeds compressed air back into the engine so it can pull a loaded tanker up a grade. The batteries, stored in a covered box on the frame, crank the engine and power the electrical system. Clean, tight battery terminals and secure hold-downs matter here."
      },
      {
        "heading": "Two fluids, never confused: diesel vs. DEF",
        "body": "The tractor fuel tanks are the polished aluminum saddle tanks that hold the truck's own diesel. This is completely separate from the cargo in the trailer. The DEF tank is a small, separate tank of Diesel Exhaust Fluid, identified by its blue cap. DEF is injected into the exhaust to cut emissions; it is not fuel and never goes in the fuel tanks. Add oil at the marked oil check points. Diesel, DEF, oil, and coolant each have their own home."
      }
    ],
    "task": {
      "instruction": "Open the engine x-ray view and click through the systems: find the engine block and its oil pan, the radiator with its fan, the air filter and turbo that feed it air, then locate the two saddle fuel tanks and the smaller DEF tank. Notice how the diesel tanks and the blue-cap DEF tank are entirely separate.",
      "type": "xray",
      "targetParts": [
        "engine",
        "oilPan",
        "radiator",
        "fan",
        "airfilter",
        "turbo",
        "fuelTanks",
        "defTank"
      ]
    },
    "checkpoint": {
      "question": "The tractor's diesel fuel tanks and the DEF tank are two different things. What is DEF (Diesel Exhaust Fluid) actually used for?",
      "options": [
        "It is a backup fuel the engine burns when the diesel tanks run low",
        "It is injected into the exhaust to cut emissions, and is not fuel",
        "It is the coolant that circulates through the radiator",
        "It is the cargo the tanker trailer is hauling"
      ],
      "answerIndex": 1,
      "explanation": "DEF is not fuel. It is injected into the exhaust stream to reduce emissions and lives in its own small tank with a blue cap, kept separate from the diesel in the aluminum saddle fuel tanks. Coolant lives in the radiator system, and the cargo rides in the trailer."
    },
    "safetyNote": "This module is for awareness and familiarization only. It is an educational prototype, not official Pilot, DOT, FMCSA, or PHMSA training. Engine bays contain hot surfaces, pressurized coolant, and a fan that can start without warning. Never open a hot cooling system, and follow qualified instruction and manufacturer guidance for any real inspection or service."
  },
  {
    "id": "m4",
    "number": 4,
    "title": "Coupling & Fifth Wheel",
    "objective": "Understand how the tractor and loaded tanker are joined and what a secure coupling looks like.",
    "duration": "4 min",
    "explorerAction": "normal",
    "highlightParts": [
      "fifthWheel",
      "kingpin",
      "airLines",
      "landingGear",
      "frame",
      "catwalk"
    ],
    "sections": [
      {
        "heading": "The Fifth Wheel: Where the Load Rides",
        "body": "The fifth wheel is the flat, greased steel plate mounted over the tractor's rear frame. It carries the enormous downward weight of a loaded tanker and lets the trailer pivot when turning. Its horseshoe-shaped throat guides the trailer's pin into place, and internal locking jaws close around that pin. Because a full gasoline tanker is heavy and its liquid load shifts, this single plate is the backbone of the whole connection."
      },
      {
        "heading": "The Kingpin & Locked Jaws",
        "body": "The kingpin is the thick steel pin hanging down from the front of the trailer. When the tractor backs under the trailer, the kingpin slides into the fifth wheel's throat and the jaws snap shut around it. A secure coupling means the jaws are fully closed behind the pin, not caught on the front of it, and the two plates sit flush with no gap. That gap-free, metal-on-metal seating is the visual sign the connection is right."
      },
      {
        "heading": "Air & Electrical Lines",
        "body": "The air lines are the coiled red and blue hoses running from the tractor to the trailer. Blue supplies service air for normal braking; red is the emergency line that also releases the trailer's spring brakes. The electrical cord carries power for the trailer's lights and markers. On a properly coupled rig these lines run without kinks, aren't rubbing on the frame or catwalk, and are seated firmly in their glad-hand connectors."
      },
      {
        "heading": "Landing Gear & Frame Support",
        "body": "The landing gear is the pair of retractable legs that hold the trailer up when it stands alone. Once coupled, those legs are fully cranked up and off the ground so the fifth wheel and tractor frame bear the entire load. Landing gear left partly down can drag or catch. A secure setup shows the plates locked, the pin seated, the lines connected and clear, and the gear raised."
      }
    ],
    "task": {
      "instruction": "In the normal solid view, click the fifth wheel and kingpin to see how the pin seats into the plate, then follow the air lines from the tractor to the trailer and confirm the landing gear is raised.",
      "type": "inspect",
      "targetParts": [
        "fifthWheel",
        "kingpin",
        "airLines",
        "landingGear"
      ]
    },
    "checkpoint": {
      "question": "On a securely coupled tanker, what confirms the kingpin is properly held by the fifth wheel?",
      "options": [
        "The locking jaws are fully closed behind the pin and the two plates sit flush with no gap",
        "The kingpin rests on top of the fifth wheel plate",
        "The landing gear is still partly lowered for extra support",
        "The air lines are disconnected to relieve pressure"
      ],
      "answerIndex": 0,
      "explanation": "A secure coupling has the fifth wheel's jaws closed completely behind the kingpin with the plates seated flush and no visible gap. The pin should never sit on top of the plate, the landing gear should be fully raised, and the air lines must stay connected."
    },
    "safetyNote": "Awareness only. This module familiarizes you with what a secure coupling looks like; it is not a coupling procedure or authoritative fuel-handling instruction. Real coupling, uncoupling, and fuel transfer must follow official Pilot and DOT/FMCSA/PHMSA training and a qualified operator."
  },
  {
    "id": "m5",
    "number": 5,
    "title": "Gasoline Tanker Trailer Components",
    "objective": "Identify the tanker-specific components that make up a DOT-406 gasoline trailer and explain what each one does.",
    "duration": "6 min",
    "explorerAction": "normal",
    "highlightParts": [
      "tankShell",
      "frontCap",
      "rearCap",
      "tankFrame",
      "catwalk",
      "hatch",
      "valves",
      "hose",
      "hoseTubes",
      "landingGear",
      "ladder",
      "spillKit"
    ],
    "sections": [
      {
        "heading": "The Shell, Heads, and Frame",
        "body": "A DOT-406 trailer is built for gasoline and other low-pressure flammable liquids. The tankShell is the elliptical aluminum barrel that holds the product; its oval cross-section keeps the center of gravity low. At each end, the frontCap and rearCap (the heads) close off the shell and take the sloshing loads. The tankFrame, or saddle structure, cradles the shell and ties it to the running gear. Learning these four parts gives you the skeleton every other component hangs on."
      },
      {
        "heading": "Walking the Top: Catwalk and Hatches",
        "body": "The catwalk is the walkway running along the top spine of the tank, giving access to each compartment opening. The hatch (dome lid) sits over each compartment and is opened to gauge product, inspect, or vent. On a multi-compartment DOT-406, you will see a hatch per compartment. Anything on top means working at height, so the catwalk's grip surface and the ladder that reaches it are safety items, not conveniences. Look at how the catwalk lines up with the hatches below your feet."
      },
      {
        "heading": "The Wet Side: Valves, Manifold, Hoses",
        "body": "Underneath, the valves and manifold form the piping that moves product in and out of each compartment. The hose is the flexible line used to connect the trailer to a fitting; between jobs it stows in the hoseTubes, the capped carrier tubes mounted along the trailer frame that keep the hose clean and drained. This is the wet side of the trailer. Your job here is recognition only: know which parts carry product and which are structure, so you can spot a component that looks wrong."
      },
      {
        "heading": "Ground Support and Spill Response",
        "body": "The landingGear (the crank-down legs) holds the trailer level and stable when it is parked and uncoupled from the tractor. The ladder provides the fixed climb up to the catwalk. The spillKit is the trailer's onboard containment gear, absorbents and barriers staged in case product escapes. Together these are the parts that keep the trailer safe when stationary and the parts you reach for if something goes wrong on the ground."
      }
    ],
    "task": {
      "instruction": "Enter the normal solid view and click each highlighted part in turn: start at the tankShell and frontCap and rearCap, follow the catwalk and a hatch across the top, then drop to the valves, hose, and hoseTubes underneath, and finish at the landingGear, ladder, and spillKit. For each one, say out loud whether it is structure, product-carrying, access, or safety gear.",
      "type": "explore",
      "targetParts": [
        "tankShell",
        "frontCap",
        "rearCap",
        "catwalk",
        "hatch",
        "valves",
        "hose",
        "hoseTubes",
        "landingGear",
        "ladder",
        "spillKit"
      ]
    },
    "checkpoint": {
      "question": "On the tanker trailer, what is the purpose of the hoseTubes?",
      "options": [
        "They pump gasoline between compartments",
        "They are the capped carrier tubes that stow and drain the hose between jobs",
        "They are the crank-down legs that support a parked trailer",
        "They vent vapor off the top of the tank"
      ],
      "answerIndex": 1,
      "explanation": "The hoseTubes are the capped tubes mounted along the trailer frame that carry the stowed hose, keeping it clean and drained between jobs. The crank-down legs are the landingGear, and product movement is handled by the valves and manifold, not the hose tubes."
    },
    "safetyNote": "This module is awareness and familiarization only. It identifies what tanker components are and why they matter; it is not official Pilot, DOT/FMCSA/PHMSA, or hazmat training and is not authoritative operating or fuel-handling procedure. Never treat this prototype as instruction for performing a real fuel transfer."
  },
  {
    "id": "m6",
    "number": 6,
    "title": "Lights, Reflectors, Tires & Exterior Safety",
    "objective": "Recognize the exterior conspicuity, lighting, and tire items that keep the rig visible and roadworthy.",
    "duration": "5 min",
    "explorerAction": "normal",
    "highlightParts": [
      "headlights",
      "rearLights",
      "sideMarkers",
      "reflectiveTape",
      "wheelsTractor",
      "wheelsTrailer",
      "mudflapsTrailer",
      "placard"
    ],
    "sections": [
      {
        "heading": "Being Seen: Lights and Markers",
        "body": "A loaded tanker is long, heavy, and slow to stop, so other drivers need to read where it is at every hour. The headlights light the road and announce the rig at the front. The rearLights carry brake, tail, and turn signals at the back. Scattered along the cab and trailer, the sideMarkers and roofMarkers outline the vehicle's length and height in the dark, so a driver approaching from the side sees a shape, not a gap."
      },
      {
        "heading": "Reflective Tape and Conspicuity",
        "body": "Lights fail; reflective surfaces don't need power. The reflectiveTape is the red-and-white striping along the trailer sides and rear. When headlights hit it, the tape lights up the full outline of the tank, which is why it matters most at night and in rain. Combined with the placard diamonds, this striping tells anyone behind the rig both how big it is and that it carries a flammable load worth extra following distance."
      },
      {
        "heading": "Tires, Wheels, and Lug Nuts",
        "body": "The wheelsTractor and wheelsTrailer are the only thing between the load and the road. On a walk-around you look at each tire for proper inflation, even tread, and no cuts, bulges, or objects wedged in the tread. At the wheels you check that lug nuts are tight and none show rust streaks or shiny gaps that hint they've loosened. A tire or wheel problem on a heavy fuel load is not a minor issue, so this is a core roadworthiness check."
      },
      {
        "heading": "Mud Flaps and Placards",
        "body": "The mudflapsTractor and mudflapsTrailer hang behind the tires to catch road spray, gravel, and debris that would otherwise blast following vehicles or coat the rear lights and tape. The placard is the diamond-shaped hazard sign that identifies the cargo class to responders and other drivers. Flaps that are torn or missing, and placards that are wrong, faded, or absent, are both things a walk-around is meant to catch before the rig moves."
      }
    ],
    "task": {
      "instruction": "Walk the outside of the rig and find every item that keeps it visible and roadworthy. Click the headlights and rearLights, trace the reflectiveTape and sideMarkers along the trailer, inspect the wheelsTractor and wheelsTrailer, then check the mudflapsTrailer and the placard. Note what a bad version of each would look like.",
      "type": "explore",
      "targetParts": [
        "headlights",
        "rearLights",
        "sideMarkers",
        "reflectiveTape",
        "wheelsTractor",
        "wheelsTrailer",
        "mudflapsTrailer",
        "placard"
      ]
    },
    "checkpoint": {
      "question": "Why does the reflective tape along the trailer matter even when the rig's lights are working?",
      "options": [
        "It replaces the need for headlights during the day",
        "It needs no power and outlines the trailer when another vehicle's headlights hit it",
        "It tells the driver how much fuel is in each compartment",
        "It keeps road spray off the following traffic"
      ],
      "answerIndex": 1,
      "explanation": "Reflective tape is passive, so it works even if a lamp burns out. When another vehicle's headlights strike it, the red-and-white striping lights up the full outline of the trailer, which is why it's critical at night and in rain. Catching road spray is the mud flaps' job, not the tape's."
    }
  },
  {
    "id": "m7",
    "number": 7,
    "title": "Tanker X-Ray & Internal Compartments",
    "objective": "Visualize how a gasoline tanker is divided internally into separate compartments and understand why that layout matters.",
    "duration": "5 min",
    "explorerAction": "tank",
    "highlightParts": [
      "tankShell",
      "compartments",
      "baffles",
      "hatch",
      "valves",
      "tankFrame"
    ],
    "sections": [
      {
        "heading": "One shell, many tanks",
        "body": "From the outside the tankShell looks like a single long cylinder, but inside it is split into several separate compartments. A gasoline transport typically carries a few thousand gallons per compartment, adding up to roughly 9,000 gallons or more across the whole trailer. Splitting the load lets one trailer haul different products at once and keeps any single volume of liquid smaller and easier to manage."
      },
      {
        "heading": "Why grades ride separately",
        "body": "Regular, mid-grade, premium, and sometimes diesel each need to stay pure. Keeping them in isolated compartments, each fed and drawn through its own hatch on top and its own valves underneath, prevents cross-contamination. That is why one compartment can be full while the next is empty, and why the paperwork tracks exactly which grade sits in which compartment."
      },
      {
        "heading": "Baffles vs. bulkheads",
        "body": "The internal walls come in two kinds. A bulkhead is a solid wall that fully separates one compartment from another. A baffle is a wall with openings in it, placed inside a compartment to slow liquid surge. Baffles let fuel pass through slowly so it does not slam forward under braking, while bulkheads keep grades completely apart. Open the tankFrame and baffles view to see how they alternate."
      },
      {
        "heading": "Surge and why it matters",
        "body": "Liquid in a partly filled compartment sloshes when the truck starts, stops, or turns. Baffles break up that motion so the load stays more stable, which affects braking distance and cornering feel. This is awareness of the design, not a driving instruction. It explains why a partially loaded tanker handles differently than a solid, dry freight load."
      }
    ],
    "task": {
      "instruction": "Switch to the tank x-ray view and look inside the tankShell. Identify the separate compartments, then find the baffles between and within them. Note which internal walls are solid bulkheads and which are perforated baffles.",
      "type": "xray",
      "targetParts": [
        "tankShell",
        "compartments",
        "baffles"
      ]
    },
    "checkpoint": {
      "question": "What is the main difference between a baffle and a bulkhead inside a gasoline tanker?",
      "options": [
        "A bulkhead is a solid wall separating compartments, while a baffle has openings that slow liquid surge",
        "A baffle fully seals off compartments, while a bulkhead lets fuel pass between them",
        "They are two names for the same solid dividing wall",
        "A bulkhead holds diesel and a baffle holds gasoline"
      ],
      "answerIndex": 0,
      "explanation": "A bulkhead is a solid wall that fully separates one compartment from another and keeps grades from mixing. A baffle is a wall with openings placed inside a compartment to slow liquid surge, letting fuel move through slowly instead of slamming forward."
    },
    "safetyNote": "This module builds awareness of how a tanker is designed internally. It is an educational prototype only, not official Pilot, DOT, FMCSA, or PHMSA training, and not authoritative instruction for loading, hauling, or handling fuel."
  },
  {
    "id": "m8",
    "number": 8,
    "title": "Pre-Trip Walkaround Simulation",
    "objective": "Follow a familiarization walkaround of the rig to learn what a driver looks at before rolling.",
    "duration": "6 min",
    "explorerAction": "pretrip",
    "highlightParts": [
      "headlights",
      "mirrors",
      "wheelsTractor",
      "mudflapsTractor",
      "landingGear",
      "placard",
      "valves",
      "emergencyShutoff",
      "spillKit"
    ],
    "sections": [
      {
        "heading": "What a Walkaround Is For",
        "body": "A walkaround is the slow lap a driver makes around the rig before rolling, looking for anything out of place. This module runs the built-in guided pre-trip mode so you can see the path a driver takes and the parts they stop at. Think of it as building awareness of where to look, not memorizing a checklist. The goal is familiarization: knowing the rig well enough that something wrong catches your eye."
      },
      {
        "heading": "Front and Cab Side",
        "body": "The lap usually starts at the front. A driver checks the headlights and foglights for cracks or dark bulbs, then confirms the mirrors are clean and aimed. Moving down the driver side, they scan the wheelsTractor for loose or missing lug nuts, uneven tire wear, and low pressure, and glance at the mudflapsTractor to confirm they are present and not torn. Small things here, a hanging mudflap or a soft tire, are exactly what the lap is meant to catch."
      },
      {
        "heading": "Trailer and Coupling",
        "body": "At the trailer, attention shifts to the placard, which must be correct for the product loaded and clearly readable. The driver confirms the landingGear is fully raised and its crank is stowed. Around the tanker body they look at the valves and the emergencyShutoff to confirm nothing is leaking, dripping, or left open, and check that the spillKit is stocked and in place. This is awareness of the fuel system, not instruction on operating any valve."
      },
      {
        "heading": "Reading the Rig",
        "body": "The value of the lap is the habit of looking, not the order of steps. A leaking fitting, a flat inside dual, a missing placard, or a chock still under a wheel all announce themselves to a driver who walks the same path every time. Watching the guided mode shows you where those trouble spots hide. Treat this as an introduction to that habit, and always defer to certified training and the company checklist for a real inspection."
      }
    ],
    "task": {
      "instruction": "Launch the guided pre-trip mode and follow the walkaround path. Stop at each highlighted part and note what a driver is checking there: bulbs and lenses at the headlights, aim and cleanliness at the mirrors, lug nuts and tire condition at the wheelsTractor, and the placard, landingGear, valves, emergencyShutoff, and spillKit at the trailer.",
      "type": "pretrip",
      "targetParts": [
        "headlights",
        "mirrors",
        "wheelsTractor",
        "mudflapsTractor",
        "placard",
        "landingGear",
        "valves",
        "emergencyShutoff",
        "spillKit"
      ]
    },
    "checkpoint": {
      "question": "During the familiarization walkaround, what is the driver confirming when they stop at the placard on the tanker trailer?",
      "options": [
        "That it is correct for the product loaded and clearly readable",
        "That it is painted the company's brand color",
        "That it lists the driver's name and license number",
        "That it can be removed quickly for washing"
      ],
      "answerIndex": 0,
      "explanation": "The placard identifies the hazardous product being hauled. On the walkaround a driver confirms it matches the load and is clean and readable, so responders and inspectors can identify the cargo at a glance. This is awareness only, not a certified inspection."
    },
    "safetyNote": "This module is awareness and familiarization only. It shows where a driver looks during a walkaround and does not teach how to operate valves, the emergency shutoff, or perform any fuel handling. It is not an official Pilot, DOT, FMCSA, or PHMSA inspection. Always rely on certified training and your company's checklist for a real pre-trip."
  },
  {
    "id": "m9",
    "number": 9,
    "title": "Fuel Transfer System Awareness",
    "objective": "Identify the parts and safety devices involved in a gasoline drop so you understand what each one is for at an awareness level.",
    "duration": "6 min",
    "explorerAction": "unload",
    "highlightParts": [
      "valves",
      "hose",
      "vaporRecovery",
      "emergencyShutoff",
      "spillKit",
      "chocks",
      "cones",
      "port"
    ],
    "sections": [
      {
        "heading": "Awareness only — this is not a procedure",
        "body": "This module builds familiarity, not qualification. A real gasoline drop is governed by DOT, PHMSA, and site-specific rules, and is performed only by trained, authorized personnel. Here you learn what the transfer parts are and why they exist, so the hardware makes sense when you see it. Nothing here tells you how to perform a drop. Product identity is confirmed against the placard before anything is connected."
      },
      {
        "heading": "The transfer path: valves, piping, and hose",
        "body": "Cargo leaves the tank through the sidePiping and a manifold of valves under the trailer, then travels through the hose to the receiving fill port. The valves are the control points that isolate each compartment and direction of flow. The hose is the flexible link between truck and port. Together they form the wetted path that product moves through, which is why their condition and connections matter so much."
      },
      {
        "heading": "Vapor recovery and emergency shutoff",
        "body": "Gasoline gives off vapor, so a vaporRecovery line captures displaced vapor during transfer instead of releasing it to the air — it is both an environmental and a fire-safety device. The emergencyShutoff is the fast-stop control that halts flow if something goes wrong. Knowing these two exist, and being able to point to them, is the core safety awareness for any fuel transfer."
      },
      {
        "heading": "The safety perimeter: chocks, cones, spill kit, port",
        "body": "Before any connection, wheels are chocked so the rig cannot move, cones mark the work zone and keep others clear, and a spillKit stands ready to contain a release. The port is the fixed receiving connection product flows into. These items surround the transfer as a layered safety setup: stop the truck moving, mark the space, and be ready to contain. Recognizing them tells you a drop zone is set up correctly."
      }
    ],
    "task": {
      "instruction": "Enter unload view and locate the four transfer-safety devices in order: the valves manifold, the hose, the vapor recovery line, and the emergency shutoff. Then find the spill kit and chocks nearby. Click each to confirm what it does.",
      "type": "unload",
      "targetParts": [
        "valves",
        "hose",
        "vaporRecovery",
        "emergencyShutoff",
        "spillKit",
        "chocks"
      ]
    },
    "checkpoint": {
      "question": "During a gasoline transfer, what is the vaporRecovery line's job?",
      "options": [
        "It captures displaced gasoline vapor instead of releasing it to the air",
        "It increases the flow rate of product into the port",
        "It chocks the wheels so the trailer cannot roll",
        "It replaces the hose when the primary line is in use"
      ],
      "answerIndex": 0,
      "explanation": "The vapor recovery line captures vapor displaced during transfer, serving as both an environmental control and a fire-safety device. The emergency shutoff stops flow, chocks secure the wheels, and the hose carries product — each is a separate part with its own purpose."
    },
    "safetyNote": "Awareness only. This is an educational prototype, not Pilot, DOT, PHMSA, or hazmat training, and not operating instruction. It does not teach how to perform a fuel drop. Real gasoline transfer is done only by trained, authorized personnel following official procedures and site rules."
  },
  {
    "id": "m10",
    "number": 10,
    "title": "Knowledge Check",
    "objective": "Recall the key components and safety concepts from the course before beginning the final assessment.",
    "duration": "4 min",
    "explorerAction": "normal",
    "highlightParts": [
      "placard",
      "emergencyShutoff",
      "extinguisher",
      "chocks",
      "hatch",
      "fifthWheel",
      "vaporRecovery",
      "spillKit"
    ],
    "sections": [
      {
        "heading": "What You Have Covered",
        "body": "You have walked the whole rig, from the tractor and cab controls through the engine bay and into the coupling and tanker trailer. The goal has been familiarization: knowing what each part is, why it matters, and what to look at during a walkaround. This module is a recap, not new material. Return to the solid model view and let the major systems settle in your mind before the assessment."
      },
      {
        "heading": "Components to Recognize",
        "body": "Be sure you can name the parts that carry the most weight. The fifthWheel and kingpin lock tractor to trailer. The placard on the trailer identifies the cargo to responders. The emergencyShutoff, hatch, vaporRecovery, and valves are the heart of the tanker. On the ground, chocks steady the trailer and the spillKit stands ready. In the cab, the extinguisher is your first line of defense."
      },
      {
        "heading": "Safety Concepts",
        "body": "Recognition supports safe awareness. Chocks and a set parking brake keep the trailer from moving. The placard tells others what the load is. The emergencyShutoff and spillKit exist because gasoline is a flammable, high-hazard cargo. Baffles inside the tankShell manage surge. None of this is operating instruction; it is knowing what a trained professional relies on and why each item is there."
      }
    ],
    "task": {
      "instruction": "Return to the solid model and click each highlighted safety component in turn. Name what it is and one reason it matters before moving to the next.",
      "type": "explore",
      "targetParts": [
        "placard",
        "emergencyShutoff",
        "extinguisher",
        "chocks",
        "spillKit"
      ]
    },
    "checkpoint": {
      "question": "On a gasoline tanker, what is the placard on the trailer for?",
      "options": [
        "It identifies the hazardous cargo so emergency responders know what they are dealing with",
        "It shuts off product flow in an emergency",
        "It chocks the wheels to keep the trailer from rolling",
        "It recovers fuel vapors during transfer"
      ],
      "answerIndex": 0,
      "explanation": "The placard is a hazard identification marker. It tells responders and others what the trailer is carrying. The emergencyShutoff stops flow, chocks steady the trailer, and vaporRecovery handles vapors, but only the placard communicates the cargo's identity."
    },
    "safetyNote": "This is an educational prototype for familiarization only, not official Pilot, DOT, FMCSA, or PHMSA training. The tanker and fuel-transfer content builds awareness of the system; it is not authoritative operating or fuel-handling instruction. Real procedures require certified hazmat training and qualified supervision."
  }
],
  QUIZ: [
  {
    "id": "q1",
    "type": "mc",
    "prompt": "This training prototype separates the rig into two major sections. Which pairing correctly describes them?",
    "choices": [
      "A powered tractor (cab and engine) up front, and a tanker trailer that carries the liquid cargo behind it",
      "A passenger bus in front and a flatbed behind",
      "Two identical tank trailers connected end to end",
      "A tow truck and a disabled car"
    ],
    "answerIndex": 0,
    "explanation": "The rig is a tractor-trailer: the tractor holds the driver, engine, and controls, while the tanker trailer is a pressure/atmospheric vessel that holds the fuel cargo. Recognizing this split is the foundation for everything else.",
    "moduleRef": "m1"
  },
  {
    "id": "q2",
    "type": "click",
    "prompt": "Click the component that connects the tractor to the trailer and locks onto the kingpin.",
    "targetPartId": "fifthWheel",
    "choices": [
      "fifthWheel",
      "landingGear",
      "catwalk",
      "exhaust"
    ],
    "explanation": "The fifth wheel is the horseshoe-shaped coupling plate on the tractor frame. The trailer's kingpin drops into it and is captured by the locking jaws. It is the primary mechanical link between tractor and trailer.",
    "moduleRef": "m4"
  },
  {
    "id": "q3",
    "type": "click",
    "prompt": "Click the trailer pin that drops into and is captured by the fifth wheel.",
    "targetPartId": "kingpin",
    "choices": [
      "kingpin",
      "fifthWheel",
      "landingGear",
      "airLines"
    ],
    "explanation": "The kingpin is a hardened steel pin under the front of the trailer. It engages the fifth wheel's locking jaws. Awareness of where the kingpin sits helps a learner understand what a secure coupling looks like.",
    "moduleRef": "m4"
  },
  {
    "id": "q4",
    "type": "click",
    "prompt": "Click the walkway on top of the tank that provides access to the hatches.",
    "targetPartId": "catwalk",
    "choices": [
      "catwalk",
      "ladder",
      "frame",
      "tankFrame"
    ],
    "explanation": "The catwalk is the grated walkway running along the top of the tank shell, giving access to the top hatches. Knowing it exists is important because anything on top of the tank is a fall-risk area.",
    "moduleRef": "m5"
  },
  {
    "id": "q5",
    "type": "click",
    "prompt": "Click the top opening on the tank used to access a compartment.",
    "targetPartId": "hatch",
    "choices": [
      "hatch",
      "valves",
      "vaporRecovery",
      "hose"
    ],
    "explanation": "Hatches (manways) are the sealed top openings for each compartment. On this awareness prototype they let the learner see where a compartment is entered and inspected from above.",
    "moduleRef": "m5"
  },
  {
    "id": "q6",
    "type": "click",
    "prompt": "Click the placard panel that would display the UN number and hazard class for the cargo.",
    "targetPartId": "placard",
    "choices": [
      "placard",
      "sideMarkers",
      "reflectiveTape",
      "plate"
    ],
    "explanation": "Placards are the diamond-shaped hazard signs on the trailer. For gasoline they show UN 1203 with the flammable-liquid class. They tell everyone nearby what the tank is carrying.",
    "moduleRef": "m7"
  },
  {
    "id": "q7",
    "type": "mc",
    "prompt": "On a gasoline tanker, the placard would show UN 1203. At an awareness level, what does that identifier communicate?",
    "choices": [
      "That the cargo is gasoline, a Class 3 flammable liquid",
      "That the tank is empty and safe to weld on",
      "That the trailer is rated for drinking water",
      "That the load is a non-hazardous dry good"
    ],
    "answerIndex": 0,
    "explanation": "UN 1203 is the identifier for gasoline/petrol, a Class 3 flammable liquid. The placard exists so responders and workers instantly know the hazard. This is recognition only, not handling instruction.",
    "moduleRef": "m7"
  },
  {
    "id": "q8",
    "type": "click",
    "prompt": "Click the legs that support the front of the trailer when it is uncoupled from the tractor.",
    "targetPartId": "landingGear",
    "choices": [
      "landingGear",
      "tankFrame",
      "rearBumper",
      "frame"
    ],
    "explanation": "The landing gear are the crank-down support legs under the front of the trailer. They hold the trailer level when no tractor is coupled. Recognizing them matters for understanding coupling and uncoupling.",
    "moduleRef": "m4"
  },
  {
    "id": "q9",
    "type": "click",
    "prompt": "Click the internal divider plates that reduce liquid surge inside the tank.",
    "targetPartId": "baffles",
    "choices": [
      "baffles",
      "compartments",
      "tankShell",
      "frontCap"
    ],
    "explanation": "Baffles are perforated partitions inside a compartment that slow the forward-and-back sloshing of liquid (surge). Awareness of baffles explains why a partly loaded tank handles differently from a full or empty one.",
    "moduleRef": "m7"
  },
  {
    "id": "q10",
    "type": "click",
    "prompt": "Click the internal divisions that separate the tank into multiple sections.",
    "targetPartId": "compartments",
    "choices": [
      "compartments",
      "baffles",
      "tankShell",
      "catwalk"
    ],
    "explanation": "Compartments are the separate liquid-tight sections of the tank, each with its own hatch and outlet. They allow different products or split loads and affect weight distribution.",
    "moduleRef": "m7"
  },
  {
    "id": "q11",
    "type": "click",
    "prompt": "Click the system that captures fuel vapors during loading or unloading.",
    "targetPartId": "vaporRecovery",
    "choices": [
      "vaporRecovery",
      "emergencyShutoff",
      "sidePiping",
      "hose"
    ],
    "explanation": "Vapor recovery piping routes displaced gasoline vapors back to the terminal or storage rather than venting them. Its presence is part of understanding how the tank's plumbing is laid out.",
    "moduleRef": "m5"
  },
  {
    "id": "q12",
    "type": "click",
    "prompt": "Click the control that is designed to quickly stop product flow in an emergency.",
    "targetPartId": "emergencyShutoff",
    "choices": [
      "emergencyShutoff",
      "valves",
      "hose",
      "parkingBrake"
    ],
    "explanation": "The emergency shutoff is a fast-acting means to stop flow if something goes wrong during transfer. At an awareness level, the learner should simply know it exists and where it is, not how to operate a real drop.",
    "moduleRef": "m8"
  },
  {
    "id": "q13",
    "type": "click",
    "prompt": "Click the wheel chocks used to keep the parked rig from rolling during fuel transfer.",
    "targetPartId": "chocks",
    "choices": [
      "chocks",
      "cones",
      "wheelsTrailer",
      "landingGear"
    ],
    "explanation": "Chocks are wedges placed against the tires so a parked, brake-set truck cannot roll. Using them is a basic staging-safety awareness item whenever the rig is stationary for transfer.",
    "moduleRef": "m8"
  },
  {
    "id": "q14",
    "type": "click",
    "prompt": "Click the kit staged nearby to contain accidental liquid releases.",
    "targetPartId": "spillKit",
    "choices": [
      "spillKit",
      "extinguisher",
      "chocks",
      "cones"
    ],
    "explanation": "The spill kit holds absorbents and containment materials for a minor release. Knowing it is on hand is part of fuel-transfer safety awareness; actual cleanup follows site procedures, not this prototype.",
    "moduleRef": "m8"
  },
  {
    "id": "q15",
    "type": "click",
    "prompt": "Click the fire extinguisher located in the cab.",
    "targetPartId": "extinguisher",
    "choices": [
      "extinguisher",
      "spillKit",
      "logbook",
      "radio"
    ],
    "explanation": "A rated fire extinguisher is required equipment in the cab. Recognizing where it is mounted is basic safety familiarization for any driver of a flammable-cargo vehicle.",
    "moduleRef": "m2"
  },
  {
    "id": "q16",
    "type": "mc",
    "prompt": "During pre-trip familiarization you notice the mudflaps behind the tractor drive wheels are torn away and missing. At an awareness level, what does this indicate?",
    "choices": [
      "A defect worth flagging, since mudflaps control road spray and debris and are expected equipment",
      "Nothing at all; mudflaps are purely decorative",
      "That the tank is overfilled",
      "That the fifth wheel has failed"
    ],
    "answerIndex": 0,
    "explanation": "Mudflaps (splash guards) reduce spray and thrown debris and are expected equipment. Missing or destroyed flaps are a visible defect to note. This is condition-recognition, not a repair procedure.",
    "moduleRef": "m6"
  },
  {
    "id": "q17",
    "type": "issue",
    "prompt": "At night you see that the reflective tape and rear lights along the trailer are dirty, cracked, or dark so the trailer's outline is hard to see. At an awareness level, why does this matter?",
    "choices": [
      "Conspicuity is reduced, making the large trailer harder for other drivers to see, so it should be flagged",
      "It improves fuel economy and can be ignored",
      "It only affects the radio reception",
      "It means the baffles are worn out"
    ],
    "answerIndex": 0,
    "explanation": "Reflective tape, side markers, and rear lights make a long trailer visible in the dark (conspicuity). If they are dark or damaged the trailer is harder to see and it is a defect to flag. Referenced parts: reflectiveTape, sideMarkers, rearLights.",
    "moduleRef": "m7"
  },
  {
    "id": "q18",
    "type": "issue",
    "prompt": "While viewing the coupling you see a visible gap between the trailer's kingpin plate and the tractor's fifth wheel, suggesting they are not fully seated. At an awareness level, what is the appropriate takeaway?",
    "choices": [
      "A gap suggests the coupling may not be locked; it should be treated as a serious condition to verify before the rig is considered secure",
      "A gap is normal and always safe",
      "It means the trailer needs more fuel",
      "It indicates the headlights are misaimed"
    ],
    "answerIndex": 0,
    "explanation": "A tractor and trailer should be tight against the fifth wheel with no gap, indicating the kingpin is captured by the jaws. A visible gap is a warning sign that the coupling may not be secure. This is recognition of a hazard condition, not a coupling procedure. Referenced parts: fifthWheel, kingpin.",
    "moduleRef": "m4"
  }
]
};
