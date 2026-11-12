import os
import re

base_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(base_dir)

print(f"Project root: {project_root}")

# 1. Update podspecs
podspecs = [
    os.path.join(project_root, 'node_modules/react-native/React-Core-prebuilt.podspec'),
    os.path.join(project_root, 'node_modules/react-native/third-party-podspecs/ReactNativeDependencies.podspec'),
    os.path.join(project_root, 'node_modules/react-native/sdks/hermes-engine/hermes-engine.podspec'),
]

for p in podspecs:
    if os.path.exists(p):
        with open(p, 'r') as f:
            content = f.read()
        
        # Replace the grep check with CONFIG="${CONFIGURATION:-Release}"
        new_content = re.sub(
            r'CONFIG="Release"\s*\n\s*if echo \$GCC_PREPROCESSOR_DEFINITIONS \| grep -q "DEBUG=1"; then\s*\n\s*CONFIG="Debug"\s*\n\s*fi',
            'cd "$PODS_ROOT"\n      CONFIG="${CONFIGURATION:-Release}"',
            content
        )
        if new_content != content:
            with open(p, 'w') as f:
                f.write(new_content)
            print(f"Updated podspec: {p}")
        else:
            print(f"Pattern not found in podspec: {p}")

# 2. Update local podspec json files if present
local_podspecs = [
    os.path.join(project_root, 'ios/Pods/Local Podspecs/React-Core-prebuilt.podspec.json'),
    os.path.join(project_root, 'ios/Pods/Local Podspecs/ReactNativeDependencies.podspec.json'),
    os.path.join(project_root, 'ios/Pods/Local Podspecs/hermes-engine.podspec.json'),
]

for lp in local_podspecs:
    if os.path.exists(lp):
        with open(lp, 'r') as f:
            content = f.read()
        
        new_content = re.sub(
            r'CONFIG=\\"Release\\"\s*\\n\s*if echo \$GCC_PREPROCESSOR_DEFINITIONS \| grep -q \\"DEBUG=1\\"; then\s*\\n\s*CONFIG=\\"Debug\\"\s*\\n\s*fi',
            r'cd \\"$PODS_ROOT\\"\\n      CONFIG=\\"${CONFIGURATION:-Release}\\"',
            content
        )
        if new_content != content:
            with open(lp, 'w') as f:
                f.write(new_content)
            print(f"Updated local podspec json: {lp}")
        else:
            print(f"Pattern not found in local podspec json: {lp}")

# 3. Update ios/Pods/Pods.xcodeproj/project.pbxproj
pbxproj = os.path.join(project_root, 'ios/Pods/Pods.xcodeproj/project.pbxproj')
if os.path.exists(pbxproj):
    with open(pbxproj, 'r') as f:
        content = f.read()
    
    # We want to replace the shellScript in the 3 build phases
    new_content = re.sub(
        r'CONFIG=\\"Release\\"\\n\s*if echo \$GCC_PREPROCESSOR_DEFINITIONS \| grep -q \\"DEBUG=1\\"; then\\n\s*CONFIG=\\"Debug\\"\\n\s*fi',
        r'cd \\"$PODS_ROOT\\"\\n      CONFIG=\\"${CONFIGURATION:-Release}\\"',
        content
    )
    if new_content != content:
        with open(pbxproj, 'w') as f:
            f.write(new_content)
        print(f"Updated Pods.xcodeproj/project.pbxproj successfully!")
    else:
        print("Pattern not found in Pods.xcodeproj/project.pbxproj")
