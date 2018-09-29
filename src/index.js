import * as THREE from 'three';
import GLTFLoader from 'three-gltf-loader';
import './assets/styles/style.css';
import 'normalize.css';

const OrbitControls = require('three-orbit-controls')(THREE)

var VIEW_ANGLE = 45;
var camera, scene, renderer, mixer;
var environmentMap;
var orbitControls, loader;

var clock = new THREE.Clock();

var car = {
    speed: 0.2,
    steer: 0,
    mainMaterial: null,
    wheelMaterial: null,
    doors: {
        openSpeed: 0.02,
        state: 0,
        action: null,
        needOpen: false,
        open() {
            this.action.play();
            this.action.timeScale = 0;
            this.needOpen = true;
        },
        close() {
            this.needOpen = false;
        },
        update() {
            if (this.needOpen)
                this.state += this.openSpeed;
            else
                this.state -= this.openSpeed;
            this.state = Math.max(0, Math.min(1, this.state)); 
            
            if (this.action)
                this.action.time = this.state;
        }
    },
    wheels: {
        front: [],
        rear: [],
        rotation: 0,
        update() {
            var self = this;

            this.front.forEach(w => w.rotation.y = -car.steer);
            [...this.front, ...this.rear].forEach(w => w.rotation.x = self.rotation-=car.speed);
        }
    },
    lights: {
        turnedOn: false,
        reaction: 0.1,
        maxBrightness: 0.8,
        brightness: 0,
        front: [],
        rear: [],
        turn(on = true) {
            this.turnedOn = on;
        },
        update() {
            this.brightness += this.turnedOn ? this.reaction : -this.reaction;
            this.brightness = Math.max(0, Math.min(this.maxBrightness, this.brightness));

            var self = this;
            
            this.front.forEach(l => l.material.emissive.setRGB(self.brightness, self.brightness, self.brightness));
            this.rear.forEach(l =>
                l.material.emissive.r = self.brightness);
        
        }
    }
};

init();
animate();

async function getEnvMap() {

    if (environmentMap) {

        return environmentMap;

    }
    var posx = (await import('./assets/images/env/1/posx.jpg')).default;
    var negx = (await import('./assets/images/env/1/negx.jpg')).default;
    var posy = (await import('./assets/images/env/1/posy.jpg')).default;
    var negy = (await import('./assets/images/env/1/negy.jpg')).default;
    var posz = (await import('./assets/images/env/1/posz.jpg')).default;
    var negz = (await import('./assets/images/env/1/negz.jpg')).default;
    var urls = [posx, negx, posy, negy, posz, negz];

    environmentMap = new THREE.CubeTextureLoader().load(urls);
    environmentMap.format = THREE.RGBFormat;
    return environmentMap;

}

async function loadGLTF() {
    loader = new GLTFLoader();
    await import('./assets/models/model.bin');
    loader.load((await import('./assets/models/model.gltf')).default, async function (data) {

        let envMap = await getEnvMap();

        console.log(data)
        data.scene.traverse(function (node) {
      
            node.receiveShadow = true;
            node.castShadow = true;

            if (node.name.match(/wheel_f(r|l)/)) {
                node.rotation.order = 'YXZ';
                car.wheels.front.push(node);
            }
            else if (node.name.match(/wheel_r(r|l)/))
                car.wheels.rear.push(node);
            else if (node.name.match(/front_lights/))
                car.lights.front.push(node);
            else if (node.name.match(/rear_lights/))
                car.lights.rear.push(node);
            
            if (node.material && (node.material.isMeshStandardMaterial ||
                       (node.material.isShaderMaterial && node.material.envMap !== undefined))) {

                node.material.envMap = envMap;
                node.material.needsUpdate = true;
                if (node.material.name == 'main_material')
                    car.mainMaterial = node.material;
                else if (node.material.name == 'wheel_material')
                    car.wheelMaterial = node.material;
      
            }
      
        });

        var animations = data.animations;
   
        if (animations && animations.length) {
        
            mixer = new THREE.AnimationMixer(data.scene);
            car.doors.action = mixer.clipAction(animations[0]);
        
        }
      
        //  scene.background = envMap;
      
        scene.add(data.scene);

    }, undefined, function (error) {
        
        console.error(error);
  
    });
}

function init() {
    camera = new THREE.PerspectiveCamera(VIEW_ANGLE, window.innerWidth / window.innerHeight, 0.01, 100);
    camera.position.z = -9;
    camera.position.x = 8;
    camera.position.y = 6;
    
    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setClearColor(0x0c0c82);
    renderer.physicallyBasedShading = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(window.innerWidth, window.innerHeight) ;
  
    document.body.appendChild(renderer.domElement);
  
    orbitControls = new OrbitControls(camera, renderer.domElement);
  
    scene = new THREE.Scene();
    
    loadGLTF();
    initLights();
    initGUI();
}  

function initGUI() {
    var lightToggler = document.querySelector('.controls .light');
    var doorsToggler = document.querySelector('.controls .doors');
    var mainColorPicker = document.querySelector('.controls .mainColor');
    var wheelColorPicker = document.querySelector('.controls .wheelColor');
    var speedControl = document.querySelector('.controls .speed');
    var steerControl = document.querySelector('.controls .steer');

    lightToggler.onclick = () => {
        car.lights.turn(!car.lights.turnedOn);
    }

    doorsToggler.onclick = () => {
        if (car.doors.needOpen)
            car.doors.close();
        else
            car.doors.open();
    }

    mainColorPicker.oninput = () => {
        car.mainMaterial.color.setStyle(mainColorPicker.value);
    }
    wheelColorPicker.oninput = () => {
        car.wheelMaterial.color.setStyle(wheelColorPicker.value);
    }
    speedControl.oninput = () => {
        car.speed = Math.pow(speedControl.value, 1/4)/100;
    }
    steerControl.oninput = () => {
        car.steer = steerControl.value / 100;
    }
}

function createStopLight(intens, dist) {
    var l = new THREE.SpotLight(0xffffff, intens, dist, 90, 50, 2);
        
    l.castShadow = true;
    l.shadow.camera.fov = VIEW_ANGLE;
    l.shadow.camera.near = 0.5;
    l.shadow.camera.far = 100;   
    l.shadow.bias = -0.0001;
    l.shadow.mapSize.width = 2048;
    l.shadow.mapSize.height = 2048;
    return l;
}

function initLights() {
    
    var sun = createStopLight(2, 80);

    sun.position.x = 50;
    sun.position.y = 50;
    scene.add(sun);

    var l = createStopLight(2, 90);

    l.position.y = 60;
    scene.add(l);

    var light2 = new THREE.HemisphereLight(0xffffff, 0x999999, 0.5);

    scene.add(light2);
}

function animate() {
    requestAnimationFrame(animate);
  
    if (mixer) mixer.update(clock.getDelta());
    orbitControls.update();

    car.wheels.update();
    car.lights.update();
    car.doors.update();

    renderer.render(scene, camera);
  
}