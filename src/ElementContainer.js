// @flow

import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import ReactNative, { Animated, Easing, PanResponder, StyleSheet, ViewPropTypes } from 'react-native';

import getDistance from './helpers/getDistance';
import getScale from './helpers/getScale';

import type { Touch } from './types/Touch-type';


const RESTORE_ANIMATION_DURATION = 200;


type Event = {
    nativeEvent: {
        touches: Array<Touch>;
    };
};

type GestureState = {
    stateID: string;
    dx: number;
    dy: number;
};


const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});


export class ElementContainer extends PureComponent {
    static propTypes = {
        children: PropTypes.oneOfType([
            PropTypes.element,
            PropTypes.arrayOf(PropTypes.element),
        ]).isRequired,

        disabled: PropTypes.bool,

        style: ViewPropTypes.style,
    };

    static defaultProps = {
        disabled: false,
        style: null,
    };

    static contextTypes = {
        isDragging: PropTypes.bool,
        onGestureStart: PropTypes.func,
        onGestureRelease: PropTypes.func,

        gesturePosition: PropTypes.object,
        scaleValue: PropTypes.object,
    };

    _parent: ?Object;
    _gestureHandler: Object;
    _gestureInProgress: ?string;
    _selectedMeasurement: Measurement;
    _initialTouches: Array<Object>;

    _opacity: Animated.Value;

    constructor() {
        super(...arguments);

        this._startGesture = this._startGesture.bind(this);
        this._onGestureRelease = this._onGestureRelease.bind(this);
        this._measureSelected = this._measureSelected.bind(this);

        this._initialTouches = [];
        this._opacity = new Animated.Value(1);

        this._generatePanHandlers();
    }

    render() {
        const { children, style } = this.props;

        return (
            <Animated.View
                style={[styles.container, style, {
                    opacity: this._opacity
                }]}
                ref={node => (this._parent = node)}
                {...this._gestureHandler.panHandlers}
            >
                { children }
            </Animated.View>
        );
    }

    _generatePanHandlers = () => {
        this._gestureHandler = PanResponder.create({
            onStartShouldSetResponderCapture: () => true,
            onStartShouldSetPanResponderCapture: (event: Event) => {
                // if context to IstagramProvider exists AND two fingers are used for gesture
                return typeof this.context.isDragging !== 'undefined' && event.nativeEvent.touches.length === 2;
            },
            onMoveShouldSetResponderCapture: () => true,
            onMoveShouldSetPanResponderCapture: (event: Event) => {
                // if context to IstagramProvider exists AND two fingers are used for gesture
                return typeof this.context.isDragging !== 'undefined' && event.nativeEvent.touches.length === 2;
            },
            onPanResponderGrant: this._startGesture,
            onPanResponderMove: this._onGestureMove,
            onPanResponderRelease: this._onGestureRelease,
            onPanResponderTerminationRequest: () => {
                return this._gestureInProgress == null;
            },
            onPanResponderTerminate: (event, gestureState) => {
                return this._onGestureRelease(event, gestureState);
            },
        });
    };

    async _startGesture(event: Event, gestureState: GestureState) {
        if (this._gestureInProgress || this.props.disabled) {
            return;
        }

        this._gestureInProgress = gestureState.stateID;
        let { gesturePosition, onGestureStart, scaleValue } = this.context;
        let { touches } = event.nativeEvent;

        this._initialTouches = touches;

        let selectedMeasurement = await this._measureSelected();
        this._selectedMeasurement = selectedMeasurement;

        onGestureStart({
            element: this,
            measurement: selectedMeasurement,
        });

        gesturePosition.setValue({
            x: 0,
            y: 0,
        });

        gesturePosition.setOffset({
            x: (selectedMeasurement && selectedMeasurement.x) || 0,
            y: (selectedMeasurement && selectedMeasurement.y) || 0,
        });

        scaleValue.setValue(1);
        this._opacity.setValue(0);
    };

    _onGestureMove = (event: Event, gestureState: GestureState) => {
        let { touches } = event.nativeEvent;

        if (!this._gestureInProgress || this.props.disabled) {
            return;
        }
        if (touches.length < 2) {
            // Trigger a realease
            this._onGestureRelease(event, gestureState);
            return;
        }

        // for moving photo around
        let { gesturePosition, scaleValue } = this.context;
        let { dx, dy } = gestureState;

        gesturePosition.x.setValue(dx);
        gesturePosition.y.setValue(dy);

        // for scaling photo
        let currentDistance = getDistance(touches);
        let initialDistance = getDistance(this._initialTouches);
        let newScale = getScale(currentDistance, initialDistance);
        scaleValue.setValue(newScale);
    };

    async _onGestureRelease(event, gestureState: GestureState) {
        if (this._gestureInProgress !== gestureState.stateID || this.props.disabled) {
            return;
        }

        this._gestureInProgress = null;
        this._initialTouches = [];

        let { gesturePosition, scaleValue, onGestureRelease } = this.context;
        let { dx, dy } = gestureState;

        gesturePosition.x.setValue(((this._selectedMeasurement && this._selectedMeasurement.x) || 0) + dx);
        gesturePosition.y.setValue(((this._selectedMeasurement && this._selectedMeasurement.y) || 0) + dy);

        gesturePosition.setOffset({
            x: 0,
            y: 0,
        });

        let selectedMeasurement = await this._measureSelected();
        this._selectedMeasurement = selectedMeasurement;

        // set to initial position and scale
        Animated.parallel([
            Animated.timing(gesturePosition.x, {
                toValue: (this._selectedMeasurement && this._selectedMeasurement.x) || 0,
                duration: RESTORE_ANIMATION_DURATION,
                easing: Easing.bezier(0.645, 0.045, 0.355, 1),
                useNativeDriver: true,
            }),
            Animated.timing(gesturePosition.y, {
                toValue: (this._selectedMeasurement && this._selectedMeasurement.y) || 0,
                duration: RESTORE_ANIMATION_DURATION,
                easing: Easing.bezier(0.645, 0.045, 0.355, 1),
                useNativeDriver: true,
            }),
            Animated.timing(scaleValue, {
                toValue: 1,
                duration: RESTORE_ANIMATION_DURATION,
                easing: Easing.bezier(0.645, 0.045, 0.355, 1),
                useNativeDriver: true,
            }),
        ]).start(() => {
            this._opacity.setValue(1);

            requestAnimationFrame(() => {
                onGestureRelease();
            });
        });
    };

    async _measureSelected() {
        let parentMeasurement = await new Promise((resolve, reject) => {
            try {
                this._parent._component.measureInWindow((winX, winY, winWidth, winHeight) => {
                    resolve({
                        x: winX,
                        y: winY,
                        w: winWidth,
                        h: winHeight,
                    });
                });
            } catch (e) {
                reject(e);
            }
        });

        return {
            x: parentMeasurement.x,
            y: parentMeasurement.y,
            w: parentMeasurement.w,
            h: parentMeasurement.h,
        };
    }
}


export default ElementContainer;
