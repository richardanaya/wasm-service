#[no_mangle]
pub extern "C" fn add(left: i32, right: i32) -> i32 {
    left + right
}